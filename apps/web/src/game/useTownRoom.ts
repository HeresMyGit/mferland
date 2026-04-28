import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import {
  ROOM_NAME,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientCompleteQuest,
  type ClientCombatAction,
  type ClientEquipItem,
  type ClientInteract,
  type ClientInput,
  type ClientLootCorpse,
  type ClientSelectTalent,
  type ClientUnequipItem,
  type CombatEvent,
  type EquipmentSlotSnapshot,
  type ExperienceEvent,
  type InventoryItemSnapshot,
  type JoinOptions,
  type LootWindow,
  type NpcSnapshot,
  type PlayerSnapshot,
  type QuestOffer,
  type QuestSnapshot,
  type QuestStatusNotice,
  type QuestTurnIn,
  type TalentRankSnapshot,
} from "@mferland/shared";

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";
type RuntimeQuestCollection = {
  forEach(callback: (quest: QuestSnapshot, id: string) => void): void;
};
type RuntimeInventoryCollection = {
  forEach(callback: (item: InventoryItemSnapshot, id: string) => void): void;
};
type RuntimeEquipmentCollection = {
  forEach(callback: (slot: EquipmentSlotSnapshot, id: string) => void): void;
};
type RuntimeTalentCollection = {
  forEach(callback: (talent: TalentRankSnapshot, id: string) => void): void;
};
type RuntimePlayer = Omit<PlayerSnapshot, "sessionId" | "quests" | "inventory" | "equipment" | "talents"> & {
  quests?: RuntimeQuestCollection;
  inventory?: RuntimeInventoryCollection;
  equipment?: RuntimeEquipmentCollection;
  talents?: RuntimeTalentCollection;
};
type RuntimePlayerCollection = {
  forEach(callback: (player: RuntimePlayer, id: string) => void): void;
};
type RuntimeNpcCollection = {
  forEach(callback: (npc: NpcSnapshot, id: string) => void): void;
};

const SNAPSHOT_RENDER_INTERVAL_MS = 125;

export function useTownRoom(identity: JoinOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [combatEvents, setCombatEvents] = useState<CombatEvent[]>([]);
  const [experienceEvents, setExperienceEvents] = useState<ExperienceEvent[]>([]);
  const [questOffer, setQuestOffer] = useState<QuestOffer | null>(null);
  const [questTurnIn, setQuestTurnIn] = useState<QuestTurnIn | null>(null);
  const [questStatus, setQuestStatus] = useState<QuestStatusNotice | null>(null);
  const [lootWindow, setLootWindow] = useState<LootWindow | null>(null);
  const roomRef = useRef<Room | null>(null);
  const playersRef = useRef(new Map<string, PlayerSnapshot>());
  const npcsRef = useRef(new Map<string, NpcSnapshot>());
  const lastSnapshotRenderAtRef = useRef(0);
  const pendingSnapshotRenderRef = useRef<number | null>(null);

  const requestSnapshotRender = useCallback((force = false) => {
    const pending = pendingSnapshotRenderRef.current;
    if (force && pending !== null) {
      window.clearTimeout(pending);
      pendingSnapshotRenderRef.current = null;
    }

    const now = performance.now();
    const elapsed = now - lastSnapshotRenderAtRef.current;
    if (force || elapsed >= SNAPSHOT_RENDER_INTERVAL_MS) {
      lastSnapshotRenderAtRef.current = now;
      setSnapshotRevision((revision) => revision + 1);
      return;
    }

    if (pending !== null) return;
    pendingSnapshotRenderRef.current = window.setTimeout(() => {
      pendingSnapshotRenderRef.current = null;
      lastSnapshotRenderAtRef.current = performance.now();
      setSnapshotRevision((revision) => revision + 1);
    }, SNAPSHOT_RENDER_INTERVAL_MS - elapsed);
  }, []);

  const serverUrl = useMemo(() => {
    if (import.meta.env.VITE_SERVER_URL) return String(import.meta.env.VITE_SERVER_URL);
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.hostname}:2567`;
  }, []);

  useEffect(() => () => {
    if (pendingSnapshotRenderRef.current !== null) {
      window.clearTimeout(pendingSnapshotRenderRef.current);
      pendingSnapshotRenderRef.current = null;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const client = new Client(serverUrl);

    playersRef.current.clear();
    npcsRef.current.clear();
    requestSnapshotRender(true);
    setCombatEvents([]);
    setExperienceEvents([]);
    setStatus("connecting");
    setError(null);

    client.joinOrCreate(ROOM_NAME, identity)
      .then((room) => {
        if (disposed) {
          void room.leave();
          return;
        }

        roomRef.current = room;
        setSessionId(room.sessionId);
        setStatus("connected");

        room.onStateChange((state) => {
          const playersChanged = syncPlayerSnapshots(playersRef.current, state.players);
          const npcsChanged = syncNpcSnapshots(npcsRef.current, state.npcs);
          requestSnapshotRender(playersChanged || npcsChanged);
        });

        room.onMessage("chat", (message: ChatMessage) => {
          setChat((current) => [...current.slice(-30), message]);
        });

        room.onMessage("combatEvent", (message: CombatEvent) => {
          const now = Date.now();
          const travelMs = Math.max(0, (message.impactAt ?? message.sentAt) - message.sentAt);
          const visualEvent = {
            ...message,
            sentAt: now,
            impactAt: now + travelMs,
          };
          setCombatEvents((current) => [
            ...current.filter((event) => now - (event.impactAt ?? event.sentAt) < 1800).slice(-40),
            visualEvent,
          ]);
        });

        room.onMessage("experienceEvent", (message: ExperienceEvent) => {
          const now = Date.now();
          setExperienceEvents((current) => [
            ...current.filter((event) => now - event.sentAt < 2200).slice(-24),
            { ...message, sentAt: now },
          ]);
        });

        room.onMessage("questOffer", (message: QuestOffer) => {
          setQuestTurnIn(null);
          setQuestStatus(null);
          setQuestOffer(message);
        });

        room.onMessage("questTurnIn", (message: QuestTurnIn) => {
          setQuestOffer(null);
          setQuestStatus(null);
          setQuestTurnIn(message);
        });

        room.onMessage("questStatus", (message: QuestStatusNotice) => {
          setQuestOffer(null);
          setQuestTurnIn(null);
          setQuestStatus(message);
        });

        room.onMessage("lootWindow", (message: LootWindow) => {
          setLootWindow(message);
        });

        room.onMessage("closeLootWindow", () => {
          setLootWindow(null);
        });

        room.onLeave(() => {
          if (!disposed) {
            playersRef.current.clear();
            npcsRef.current.clear();
            requestSnapshotRender(true);
            setStatus("closed");
          }
        });
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unable to join town");
      });

    return () => {
      disposed = true;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.leave();
    };
  }, [identity, requestSnapshotRender, serverUrl]);

  useEffect(() => {
    if (!questOffer || !sessionId) return;

    const localPlayer = playersRef.current.get(sessionId);
    if (localPlayer?.quests.some((quest) => quest.id === questOffer.questId)) {
      setQuestOffer(null);
    }
  }, [questOffer, sessionId, snapshotRevision]);

  useEffect(() => {
    if (!questTurnIn || !sessionId) return;

    const localPlayer = playersRef.current.get(sessionId);
    const quest = localPlayer?.quests.find((entry) => entry.id === questTurnIn.questId);
    if (quest?.status === "completed") {
      setQuestTurnIn(null);
    }
  }, [questTurnIn, sessionId, snapshotRevision]);

  useEffect(() => {
    if (!questStatus || !sessionId) return;

    const localPlayer = playersRef.current.get(sessionId);
    const quest = localPlayer?.quests.find((entry) => entry.id === questStatus.questId);
    if (quest?.status === "completed") {
      setQuestStatus(null);
    }
  }, [questStatus, sessionId, snapshotRevision]);

  useEffect(() => {
    if (!lootWindow) return;
    const npc = npcsRef.current.get(lootWindow.npcId);
    if (!npc?.hasLoot) setLootWindow(null);
  }, [lootWindow, snapshotRevision]);

  const sendInput = useCallback((input: ClientInput) => {
    roomRef.current?.send("input", input);
  }, []);

  const sendChat = useCallback((text: string) => {
    roomRef.current?.send("chat", { text });
  }, []);

  const sendInteract = useCallback((message: ClientInteract = {}) => {
    roomRef.current?.send("interact", message);
  }, []);

  const sendAcceptQuest = useCallback((message: ClientAcceptQuest) => {
    setQuestOffer(null);
    roomRef.current?.send("acceptQuest", message);
  }, []);

  const sendCompleteQuest = useCallback((message: ClientCompleteQuest) => {
    setQuestTurnIn(null);
    roomRef.current?.send("completeQuest", message);
  }, []);

  const dismissQuestOffer = useCallback(() => {
    setQuestOffer(null);
  }, []);

  const dismissQuestTurnIn = useCallback(() => {
    setQuestTurnIn(null);
  }, []);

  const dismissQuestStatus = useCallback(() => {
    setQuestStatus(null);
  }, []);

  const sendCombatAction = useCallback((message: ClientCombatAction) => {
    roomRef.current?.send("combatAction", message);
  }, []);

  const sendLootCorpse = useCallback((message: ClientLootCorpse) => {
    roomRef.current?.send("lootCorpse", message);
  }, []);

  const sendEquipItem = useCallback((message: ClientEquipItem) => {
    roomRef.current?.send("equipItem", message);
  }, []);

  const sendUnequipItem = useCallback((message: ClientUnequipItem) => {
    roomRef.current?.send("unequipItem", message);
  }, []);

  const sendSelectTalent = useCallback((message: ClientSelectTalent) => {
    roomRef.current?.send("selectTalent", message);
  }, []);

  const closeLootWindow = useCallback(() => {
    setLootWindow(null);
  }, []);

  const sendRespawn = useCallback(() => {
    roomRef.current?.send("respawn", {});
  }, []);

  return {
    status,
    error,
    sessionId,
    players: playersRef.current,
    npcs: npcsRef.current,
    snapshotRevision,
    chat,
    combatEvents,
    experienceEvents,
    questOffer,
    questTurnIn,
    questStatus,
    lootWindow,
    sendInput,
    sendChat,
    sendInteract,
    sendAcceptQuest,
    sendCompleteQuest,
    dismissQuestOffer,
    dismissQuestTurnIn,
    dismissQuestStatus,
    sendCombatAction,
    sendLootCorpse,
    sendEquipItem,
    sendUnequipItem,
    sendSelectTalent,
    closeLootWindow,
    sendRespawn,
  };
}

function syncPlayerSnapshots(target: Map<string, PlayerSnapshot>, source: RuntimePlayerCollection) {
  const seen = new Set<string>();
  let membershipChanged = false;

  source.forEach((player, id) => {
    seen.add(id);
    const existing = target.get(id);
    if (existing) {
      updatePlayerSnapshot(existing, player, id);
      return;
    }

    target.set(id, createPlayerSnapshot(player, id));
    membershipChanged = true;
  });

  return deleteMissingSnapshots(target, seen) || membershipChanged;
}

function createPlayerSnapshot(player: RuntimePlayer, id: string): PlayerSnapshot {
  return {
    sessionId: id,
    name: player.name,
    identityType: player.identityType,
    walletAddress: player.walletAddress,
    avatarSeed: player.avatarSeed,
    level: player.level,
    xp: player.xp,
    talentPoints: player.talentPoints,
    health: player.health,
    maxHealth: player.maxHealth,
    healthRegenPer5: player.healthRegenPer5,
    mana: player.mana,
    maxMana: player.maxMana,
    manaRegenPer5: player.manaRegenPer5,
    walkSpeed: player.walkSpeed,
    runSpeed: player.runSpeed,
    strength: player.strength,
    dexterity: player.dexterity,
    magic: player.magic,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    animation: player.animation,
    lastSeq: player.lastSeq,
    attackReadyAt: player.attackReadyAt,
    shootReadyAt: player.shootReadyAt,
    fireblastReadyAt: player.fireblastReadyAt,
    frostNovaReadyAt: player.frostNovaReadyAt,
    castingAction: player.castingAction,
    castStartedAt: player.castStartedAt,
    castEndsAt: player.castEndsAt,
    lastCastAt: player.lastCastAt,
    lastDamagedAt: player.lastDamagedAt,
    quests: snapshotQuests(player.quests),
    inventory: snapshotInventory(player.inventory),
    equipment: snapshotEquipment(player.equipment),
    talents: snapshotTalents(player.talents),
  };
}

function updatePlayerSnapshot(target: PlayerSnapshot, player: RuntimePlayer, id: string) {
  target.sessionId = id;
  target.name = player.name;
  target.identityType = player.identityType;
  target.walletAddress = player.walletAddress;
  target.avatarSeed = player.avatarSeed;
  target.level = player.level;
  target.xp = player.xp;
  target.talentPoints = player.talentPoints;
  target.health = player.health;
  target.maxHealth = player.maxHealth;
  target.healthRegenPer5 = player.healthRegenPer5;
  target.mana = player.mana;
  target.maxMana = player.maxMana;
  target.manaRegenPer5 = player.manaRegenPer5;
  target.walkSpeed = player.walkSpeed;
  target.runSpeed = player.runSpeed;
  target.strength = player.strength;
  target.dexterity = player.dexterity;
  target.magic = player.magic;
  target.x = player.x;
  target.y = player.y;
  target.z = player.z;
  target.yaw = player.yaw;
  target.animation = player.animation;
  target.lastSeq = player.lastSeq;
  target.attackReadyAt = player.attackReadyAt;
  target.shootReadyAt = player.shootReadyAt;
  target.fireblastReadyAt = player.fireblastReadyAt;
  target.frostNovaReadyAt = player.frostNovaReadyAt;
  target.castingAction = player.castingAction;
  target.castStartedAt = player.castStartedAt;
  target.castEndsAt = player.castEndsAt;
  target.lastCastAt = player.lastCastAt;
  target.lastDamagedAt = player.lastDamagedAt;
  target.quests = snapshotQuests(player.quests);
  target.inventory = snapshotInventory(player.inventory);
  target.equipment = snapshotEquipment(player.equipment);
  target.talents = snapshotTalents(player.talents);
}

function syncNpcSnapshots(target: Map<string, NpcSnapshot>, source: RuntimeNpcCollection | undefined) {
  if (!source) {
    const hadNpcs = target.size > 0;
    target.clear();
    return hadNpcs;
  }

  const seen = new Set<string>();
  let membershipChanged = false;

  source.forEach((npc, id) => {
    seen.add(id);
    const existing = target.get(id);
    if (existing) {
      updateNpcSnapshot(existing, npc, id);
      return;
    }

    target.set(id, createNpcSnapshot(npc, id));
    membershipChanged = true;
  });

  return deleteMissingSnapshots(target, seen) || membershipChanged;
}

function createNpcSnapshot(npc: NpcSnapshot, id: string): NpcSnapshot {
  return {
    id,
    name: npc.name,
    role: npc.role,
    model: npc.model,
    avatarSeed: npc.avatarSeed,
    health: npc.health,
    maxHealth: npc.maxHealth,
    isImmortal: npc.isImmortal,
    x: npc.x,
    y: npc.y,
    z: npc.z,
    yaw: npc.yaw,
    animation: npc.animation,
    dialogue: npc.dialogue,
    questId: npc.questId,
    defeatedAt: npc.defeatedAt,
    despawnAt: npc.despawnAt,
    frozenUntil: npc.frozenUntil,
    aggroTargetId: npc.aggroTargetId,
    hasLoot: npc.hasLoot,
  };
}

function updateNpcSnapshot(target: NpcSnapshot, npc: NpcSnapshot, id: string) {
  target.id = id;
  target.name = npc.name;
  target.role = npc.role;
  target.model = npc.model;
  target.avatarSeed = npc.avatarSeed;
  target.health = npc.health;
  target.maxHealth = npc.maxHealth;
  target.isImmortal = npc.isImmortal;
  target.x = npc.x;
  target.y = npc.y;
  target.z = npc.z;
  target.yaw = npc.yaw;
  target.animation = npc.animation;
  target.dialogue = npc.dialogue;
  target.questId = npc.questId;
  target.defeatedAt = npc.defeatedAt;
  target.despawnAt = npc.despawnAt;
  target.frozenUntil = npc.frozenUntil;
  target.aggroTargetId = npc.aggroTargetId;
  target.hasLoot = npc.hasLoot;
}

function deleteMissingSnapshots<T>(target: Map<string, T>, seen: Set<string>) {
  let changed = false;
  for (const id of Array.from(target.keys())) {
    if (seen.has(id)) continue;
    target.delete(id);
    changed = true;
  }
  return changed;
}

function snapshotQuests(quests: RuntimeQuestCollection | undefined): QuestSnapshot[] {
  const next: QuestSnapshot[] = [];
  quests?.forEach((quest, id) => {
    next.push({
      id: (quest.id || id) as QuestSnapshot["id"],
      status: quest.status,
      progress: quest.progress,
      required: quest.required,
      flags: quest.flags,
      completedAt: quest.completedAt,
    });
  });
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

function snapshotInventory(inventory: RuntimeInventoryCollection | undefined): InventoryItemSnapshot[] {
  const next: InventoryItemSnapshot[] = [];
  inventory?.forEach((item, id) => {
    next.push({
      id: (item.id || id) as InventoryItemSnapshot["id"],
      chainTokenId: item.chainTokenId,
      count: item.count,
    });
  });
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

function snapshotEquipment(equipment: RuntimeEquipmentCollection | undefined): EquipmentSlotSnapshot[] {
  const next: EquipmentSlotSnapshot[] = [];
  equipment?.forEach((slot, id) => {
    next.push({
      slot: (slot.slot || id) as EquipmentSlotSnapshot["slot"],
      itemId: slot.itemId,
      chainTokenId: slot.chainTokenId,
    });
  });
  return next.sort((left, right) => left.slot.localeCompare(right.slot));
}

function snapshotTalents(talents: RuntimeTalentCollection | undefined): TalentRankSnapshot[] {
  const next: TalentRankSnapshot[] = [];
  talents?.forEach((talent, id) => {
    next.push({
      id: (talent.id || id) as TalentRankSnapshot["id"],
      tree: talent.tree,
      nodeId: talent.nodeId,
      rank: talent.rank,
    });
  });
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

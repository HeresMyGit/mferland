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
  type ClientUseItem,
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
import { CHAT_BUBBLE_TTL_MS, type ChatBubble } from "./chatBubbles";

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
type DebugTeleportDestination = {
  x: number;
  z: number;
  yaw?: number;
};

const SNAPSHOT_RENDER_INTERVAL_MS = 125;

export function useTownRoom(identity: JoinOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>([]);
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
  const pendingSceneRenderRef = useRef(false);
  const bubbleTimeoutsRef = useRef<number[]>([]);

  const requestSnapshotRender = useCallback((force = false, includeScene = true) => {
    if (includeScene) pendingSceneRenderRef.current = true;

    const pending = pendingSnapshotRenderRef.current;
    if (force && pending !== null) {
      window.clearTimeout(pending);
      pendingSnapshotRenderRef.current = null;
    }

    const now = performance.now();
    const elapsed = now - lastSnapshotRenderAtRef.current;
    if (force || elapsed >= SNAPSHOT_RENDER_INTERVAL_MS) {
      const shouldRenderScene = pendingSceneRenderRef.current;
      pendingSceneRenderRef.current = false;
      lastSnapshotRenderAtRef.current = now;
      setSnapshotRevision((revision) => revision + 1);
      if (shouldRenderScene) setSceneRevision((revision) => revision + 1);
      return;
    }

    if (pending !== null) return;
    pendingSnapshotRenderRef.current = window.setTimeout(() => {
      pendingSnapshotRenderRef.current = null;
      const shouldRenderScene = pendingSceneRenderRef.current;
      pendingSceneRenderRef.current = false;
      lastSnapshotRenderAtRef.current = performance.now();
      setSnapshotRevision((revision) => revision + 1);
      if (shouldRenderScene) setSceneRevision((revision) => revision + 1);
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
    for (const timeout of bubbleTimeoutsRef.current) {
      window.clearTimeout(timeout);
    }
    bubbleTimeoutsRef.current = [];
    pendingSceneRenderRef.current = false;
  }, []);

  useEffect(() => {
    let disposed = false;
    const client = new Client(serverUrl);

    playersRef.current.clear();
    npcsRef.current.clear();
    requestSnapshotRender(true);
    setChatBubbles([]);
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
          if (playersChanged || npcsChanged) requestSnapshotRender();
        });

        room.onMessage("chat", (message: ChatMessage) => {
          const receivedAt = Date.now();
          const bubble = {
            ...message,
            receivedAt,
            expiresAt: receivedAt + CHAT_BUBBLE_TTL_MS,
          };
          setChat((current) => [...current.slice(-30), message]);
          setChatBubbles((current) => [
            ...current.filter((entry) => entry.sessionId !== bubble.sessionId && entry.expiresAt > receivedAt),
            bubble,
          ].slice(-24));
          const timeout = window.setTimeout(() => {
            const now = Date.now();
            setChatBubbles((current) => current.filter((entry) => entry.expiresAt > now));
          }, CHAT_BUBBLE_TTL_MS + 80);
          bubbleTimeoutsRef.current.push(timeout);
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
            setChatBubbles([]);
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

  const sendUseItem = useCallback((message: ClientUseItem) => {
    roomRef.current?.send("useItem", message);
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

  const sendDebugTeleport = useCallback((destination: DebugTeleportDestination) => {
    if (!import.meta.env.DEV) return;
    roomRef.current?.send("debugTeleport", destination);
  }, []);

  return {
    status,
    error,
    sessionId,
    players: playersRef.current,
    npcs: npcsRef.current,
    snapshotRevision,
    sceneRevision,
    chat,
    chatBubbles,
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
    sendUseItem,
    sendSelectTalent,
    closeLootWindow,
    sendRespawn,
    sendDebugTeleport,
  };
}

function syncPlayerSnapshots(target: Map<string, PlayerSnapshot>, source: RuntimePlayerCollection) {
  const seen = new Set<string>();
  let changed = false;

  source.forEach((player, id) => {
    seen.add(id);
    const existing = target.get(id);
    if (existing) {
      changed = updatePlayerSnapshot(existing, player, id) || changed;
      return;
    }

    target.set(id, createPlayerSnapshot(player, id));
    changed = true;
  });

  return deleteMissingSnapshots(target, seen) || changed;
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
    signalShotReadyAt: player.signalShotReadyAt,
    fireblastReadyAt: player.fireblastReadyAt,
    frostNovaReadyAt: player.frostNovaReadyAt,
    healReadyAt: player.healReadyAt,
    tauntReadyAt: player.tauntReadyAt,
    whirlwindReadyAt: player.whirlwindReadyAt,
    multishotReadyAt: player.multishotReadyAt,
    iceBlastReadyAt: player.iceBlastReadyAt,
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
  let changed = false;
  changed = target.sessionId !== id || changed;
  changed = target.name !== player.name || changed;
  changed = target.identityType !== player.identityType || changed;
  changed = target.walletAddress !== player.walletAddress || changed;
  changed = target.avatarSeed !== player.avatarSeed || changed;
  changed = target.level !== player.level || changed;
  changed = target.xp !== player.xp || changed;
  changed = target.talentPoints !== player.talentPoints || changed;
  changed = target.health !== player.health || changed;
  changed = target.maxHealth !== player.maxHealth || changed;
  changed = target.healthRegenPer5 !== player.healthRegenPer5 || changed;
  changed = target.mana !== player.mana || changed;
  changed = target.maxMana !== player.maxMana || changed;
  changed = target.manaRegenPer5 !== player.manaRegenPer5 || changed;
  changed = target.walkSpeed !== player.walkSpeed || changed;
  changed = target.runSpeed !== player.runSpeed || changed;
  changed = target.strength !== player.strength || changed;
  changed = target.dexterity !== player.dexterity || changed;
  changed = target.magic !== player.magic || changed;
  changed = target.attackReadyAt !== player.attackReadyAt || changed;
  changed = target.shootReadyAt !== player.shootReadyAt || changed;
  changed = target.signalShotReadyAt !== player.signalShotReadyAt || changed;
  changed = target.fireblastReadyAt !== player.fireblastReadyAt || changed;
  changed = target.frostNovaReadyAt !== player.frostNovaReadyAt || changed;
  changed = target.healReadyAt !== player.healReadyAt || changed;
  changed = target.tauntReadyAt !== player.tauntReadyAt || changed;
  changed = target.whirlwindReadyAt !== player.whirlwindReadyAt || changed;
  changed = target.multishotReadyAt !== player.multishotReadyAt || changed;
  changed = target.iceBlastReadyAt !== player.iceBlastReadyAt || changed;
  changed = target.castingAction !== player.castingAction || changed;
  changed = target.castStartedAt !== player.castStartedAt || changed;
  changed = target.castEndsAt !== player.castEndsAt || changed;
  changed = target.lastCastAt !== player.lastCastAt || changed;
  changed = target.lastDamagedAt !== player.lastDamagedAt || changed;

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
  target.signalShotReadyAt = player.signalShotReadyAt;
  target.fireblastReadyAt = player.fireblastReadyAt;
  target.frostNovaReadyAt = player.frostNovaReadyAt;
  target.healReadyAt = player.healReadyAt;
  target.tauntReadyAt = player.tauntReadyAt;
  target.whirlwindReadyAt = player.whirlwindReadyAt;
  target.multishotReadyAt = player.multishotReadyAt;
  target.iceBlastReadyAt = player.iceBlastReadyAt;
  target.castingAction = player.castingAction;
  target.castStartedAt = player.castStartedAt;
  target.castEndsAt = player.castEndsAt;
  target.lastCastAt = player.lastCastAt;
  target.lastDamagedAt = player.lastDamagedAt;
  const nextQuests = snapshotQuests(player.quests);
  const nextInventory = snapshotInventory(player.inventory);
  const nextEquipment = snapshotEquipment(player.equipment);
  const nextTalents = snapshotTalents(player.talents);
  if (!questSnapshotsEqual(target.quests, nextQuests)) {
    target.quests = nextQuests;
    changed = true;
  }
  if (!inventorySnapshotsEqual(target.inventory, nextInventory)) {
    target.inventory = nextInventory;
    changed = true;
  }
  if (!equipmentSnapshotsEqual(target.equipment, nextEquipment)) {
    target.equipment = nextEquipment;
    changed = true;
  }
  if (!talentSnapshotsEqual(target.talents, nextTalents)) {
    target.talents = nextTalents;
    changed = true;
  }
  return changed;
}

function syncNpcSnapshots(target: Map<string, NpcSnapshot>, source: RuntimeNpcCollection | undefined) {
  if (!source) {
    const hadNpcs = target.size > 0;
    target.clear();
    return hadNpcs;
  }

  const seen = new Set<string>();
  let changed = false;

  source.forEach((npc, id) => {
    seen.add(id);
    const existing = target.get(id);
    if (existing) {
      changed = updateNpcSnapshot(existing, npc, id) || changed;
      return;
    }

    target.set(id, createNpcSnapshot(npc, id));
    changed = true;
  });

  return deleteMissingSnapshots(target, seen) || changed;
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
    slowedUntil: npc.slowedUntil,
    aggroTargetId: npc.aggroTargetId,
    hasLoot: npc.hasLoot,
  };
}

function updateNpcSnapshot(target: NpcSnapshot, npc: NpcSnapshot, id: string) {
  let changed = false;
  changed = target.id !== id || changed;
  changed = target.name !== npc.name || changed;
  changed = target.role !== npc.role || changed;
  changed = target.model !== npc.model || changed;
  changed = target.avatarSeed !== npc.avatarSeed || changed;
  changed = target.health !== npc.health || changed;
  changed = target.maxHealth !== npc.maxHealth || changed;
  changed = target.isImmortal !== npc.isImmortal || changed;
  changed = target.dialogue !== npc.dialogue || changed;
  changed = target.questId !== npc.questId || changed;
  changed = target.defeatedAt !== npc.defeatedAt || changed;
  changed = target.despawnAt !== npc.despawnAt || changed;
  changed = target.frozenUntil !== npc.frozenUntil || changed;
  changed = target.slowedUntil !== npc.slowedUntil || changed;
  changed = target.aggroTargetId !== npc.aggroTargetId || changed;
  changed = target.hasLoot !== npc.hasLoot || changed;

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
  target.slowedUntil = npc.slowedUntil;
  target.aggroTargetId = npc.aggroTargetId;
  target.hasLoot = npc.hasLoot;
  return changed;
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

function questSnapshotsEqual(left: QuestSnapshot[], right: QuestSnapshot[]) {
  if (left.length !== right.length) return false;
  return left.every((quest, index) => {
    const other = right[index];
    return quest.id === other.id
      && quest.status === other.status
      && quest.progress === other.progress
      && quest.required === other.required
      && quest.flags === other.flags
      && quest.completedAt === other.completedAt;
  });
}

function inventorySnapshotsEqual(left: InventoryItemSnapshot[], right: InventoryItemSnapshot[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return item.id === other.id
      && item.chainTokenId === other.chainTokenId
      && item.count === other.count;
  });
}

function equipmentSnapshotsEqual(left: EquipmentSlotSnapshot[], right: EquipmentSlotSnapshot[]) {
  if (left.length !== right.length) return false;
  return left.every((slot, index) => {
    const other = right[index];
    return slot.slot === other.slot
      && slot.itemId === other.itemId
      && slot.chainTokenId === other.chainTokenId;
  });
}

function talentSnapshotsEqual(left: TalentRankSnapshot[], right: TalentRankSnapshot[]) {
  if (left.length !== right.length) return false;
  return left.every((talent, index) => {
    const other = right[index];
    return talent.id === other.id
      && talent.tree === other.tree
      && talent.nodeId === other.nodeId
      && talent.rank === other.rank;
  });
}

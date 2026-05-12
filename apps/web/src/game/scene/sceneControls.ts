import * as THREE from "three";
import {
  PLAYER,
  isAttackableNpcRole,
  resolveWorldCollision,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";

const LOCAL_MOVING_DRIFT_DEADZONE = 0.85;
const LOCAL_MOVING_DRIFT_SNAP = 2.4;

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function isGameKey(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();
  return ["w", "a", "s", "d", "q", "e", "f", "tab", "escape", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)
    || ["space", "spacebar", "keyf", "tab", "escape"].includes(code);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function wrapAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function updateLocalVisualPlayer(
  visual: PlayerSnapshot,
  authoritative: PlayerSnapshot,
  move: THREE.Vector3,
  moveLength: number,
  yaw: number,
  sprint: boolean,
  jump: boolean,
  delta: number,
) {
  syncLocalVisualPlayerSnapshot(visual, authoritative);

  const drift = Math.hypot(visual.x - authoritative.x, visual.z - authoritative.z);
  const heightDrift = Math.abs(visual.y - authoritative.y);
  if (drift > LOCAL_MOVING_DRIFT_SNAP || heightDrift > 2.5) {
    visual.x = authoritative.x;
    visual.y = authoritative.y;
    visual.z = authoritative.z;
  } else {
    const positionCorrection = getLocalPositionCorrection(drift, moveLength, delta);
    const heightCorrection = 1 - Math.pow(0.48, delta * 60);
    visual.x += (authoritative.x - visual.x) * positionCorrection;
    visual.z += (authoritative.z - visual.z) * positionCorrection;
    visual.y += (authoritative.y - visual.y) * heightCorrection;
  }

  if (moveLength > 0.01) {
    const speed = sprint ? authoritative.runSpeed : authoritative.walkSpeed;
    visual.x += move.x * speed * delta;
    visual.z += move.z * speed * delta;
  }

  const resolvedPosition = resolveWorldCollision(visual.x, visual.z, PLAYER.radius);
  visual.x = resolvedPosition.x;
  visual.z = resolvedPosition.z;
  visual.yaw = yaw;
  visual.emote = authoritative.emote;
  visual.emoteStartedAt = authoritative.emoteStartedAt;
  visual.emoteEndsAt = authoritative.emoteEndsAt;
  if (moveLength > 0.01 || jump) {
    visual.emote = "";
    visual.emoteStartedAt = 0;
    visual.emoteEndsAt = 0;
  }

  const airborne = jump || authoritative.y > 0.05 || visual.y > 0.05;
  visual.animation = airborne ? "jump" : moveLength > 0.01 ? (sprint ? "run" : "walk") : "idle";
}

export function syncLocalVisualPlayerSnapshot(
  visual: PlayerSnapshot,
  authoritative: PlayerSnapshot,
) {
  visual.sessionId = authoritative.sessionId;
  visual.name = authoritative.name;
  visual.identityType = authoritative.identityType;
  visual.walletAddress = authoritative.walletAddress;
  visual.avatarSeed = authoritative.avatarSeed;
  visual.appearanceTraits = authoritative.appearanceTraits;
  visual.level = authoritative.level;
  visual.xp = authoritative.xp;
  visual.talentPoints = authoritative.talentPoints;
  visual.season0Points = authoritative.season0Points;
  visual.season0DailyPoints = authoritative.season0DailyPoints;
  visual.health = authoritative.health;
  visual.maxHealth = authoritative.maxHealth;
  visual.healthRegenPer5 = authoritative.healthRegenPer5;
  visual.mana = authoritative.mana;
  visual.maxMana = authoritative.maxMana;
  visual.manaRegenPer5 = authoritative.manaRegenPer5;
  visual.walkSpeed = authoritative.walkSpeed;
  visual.runSpeed = authoritative.runSpeed;
  visual.strength = authoritative.strength;
  visual.dexterity = authoritative.dexterity;
  visual.magic = authoritative.magic;
  visual.lastSeq = authoritative.lastSeq;
  visual.attackReadyAt = authoritative.attackReadyAt;
  visual.shootReadyAt = authoritative.shootReadyAt;
  visual.signalShotReadyAt = authoritative.signalShotReadyAt;
  visual.fireblastReadyAt = authoritative.fireblastReadyAt;
  visual.frostNovaReadyAt = authoritative.frostNovaReadyAt;
  visual.healReadyAt = authoritative.healReadyAt;
  visual.tauntReadyAt = authoritative.tauntReadyAt;
  visual.whirlwindReadyAt = authoritative.whirlwindReadyAt;
  visual.multishotReadyAt = authoritative.multishotReadyAt;
  visual.iceBlastReadyAt = authoritative.iceBlastReadyAt;
  visual.castingAction = authoritative.castingAction;
  visual.castStartedAt = authoritative.castStartedAt;
  visual.castEndsAt = authoritative.castEndsAt;
  visual.lastCastAt = authoritative.lastCastAt;
  visual.lastDamagedAt = authoritative.lastDamagedAt;
  visual.quests = authoritative.quests;
  visual.inventory = authoritative.inventory;
  visual.equipment = authoritative.equipment;
  visual.talents = authoritative.talents;
}

function getLocalPositionCorrection(drift: number, moveLength: number, delta: number) {
  if (moveLength <= 0.01) return 1 - Math.pow(0.64, delta * 60);
  if (drift < LOCAL_MOVING_DRIFT_DEADZONE) return 0;
  return 1 - Math.pow(0.985, delta * 60);
}

export function getNextEnemyTarget(
  player: PlayerSnapshot,
  npcs: Map<string, NpcSnapshot>,
  selectedTarget: TargetSelection | null,
  reverse: boolean,
): TargetSelection | null {
  const enemies = Array.from(npcs.values())
    .filter((npc) => isAttackableNpcRole(npc.role) && (npc.isImmortal || npc.health > 0))
    .map((npc) => ({
      npc,
      distance: Math.hypot(player.x - npc.x, player.z - npc.z),
    }))
    .filter(({ distance }) => distance <= 36)
    .sort((a, b) => a.distance - b.distance);

  if (enemies.length === 0) return null;

  const currentIndex = selectedTarget?.kind === "npc"
    ? enemies.findIndex(({ npc }) => npc.id === selectedTarget.id)
    : -1;
  const offset = reverse ? -1 : 1;
  const nextIndex = currentIndex === -1
    ? 0
    : (currentIndex + offset + enemies.length) % enemies.length;

  return { kind: "npc", id: enemies[nextIndex].npc.id };
}

export function isVisibleNpc(npc: NpcSnapshot) {
  return npc.isImmortal || npc.health > 0 || npc.despawnAt > 0;
}

export function isTargetSelected(
  selectedTarget: TargetSelection | null,
  kind: TargetSelection["kind"],
  id: string,
) {
  return selectedTarget?.kind === kind && selectedTarget.id === id;
}

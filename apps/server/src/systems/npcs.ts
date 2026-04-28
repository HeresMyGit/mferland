import { type MapSchema } from "@colyseus/schema";
import {
  COMBAT,
  FARMER_COMBAT,
  PLAYER,
  resolveWorldCollision,
  stableHash,
  type CombatActionId,
  type CombatEvent,
  type NpcModel,
  type NpcRole,
  type QuestId,
} from "@mferland/shared";
import { NpcState, type PlayerState } from "../state.js";
import { applyNpcCombatDamage, isNpcAlive, type PendingCombatImpact } from "./combat.js";
import { randomRange } from "./utils.js";

const HOG_COMBAT = {
  leashRange: 30,
  moveSpeed: 4.1,
  meleeRange: 2.15,
  meleeDamage: 5,
  meleeCooldownMs: 1700,
};

export type NpcSpawnSpec = {
  id: string;
  name: string;
  role: NpcRole;
  model?: NpcModel;
  x: number;
  z: number;
  yaw: number;
  leashRadius: number;
  dialogue: string;
  questId?: QuestId;
  health?: number;
  maxHealth?: number;
  isImmortal?: boolean;
  combatStyle?: "melee" | "caster";
};

export function spawnNpcs(npcs: MapSchema<NpcState>) {
  const specs: NpcSpawnSpec[] = [
    {
      id: "og-mfer",
      name: "OG mfer",
      role: "quest_giver",
      x: -4.2,
      z: 3.9,
      yaw: 2.3,
      leashRadius: 1.1,
      dialogue: "Quest: check in with me once you have your bearings.",
      questId: "mfer-beginnings",
    },
    {
      id: "dao-mfer",
      name: "DAO mfer",
      role: "quest_giver",
      x: 14.8,
      z: -8.8,
      yaw: -1.7,
      leashRadius: 1.5,
      dialogue: "Quest: find the DAO hall and report back.",
      questId: "dao-tour",
    },
    {
      id: "wearables-mfer",
      name: "Wearables mfer",
      role: "merchant",
      x: -14.8,
      z: 12.5,
      yaw: 1.1,
      leashRadius: 1.2,
      dialogue: "Shop is warming up. If OG sent you, hand it over.",
    },
    {
      id: "gate-guard",
      name: "Gate guard",
      role: "guard",
      x: 5.5,
      z: -18.5,
      yaw: 0.2,
      leashRadius: 4.8,
      dialogue: "Mfers only beyond the gate. Keep it moving.",
    },
    {
      id: "plaza-mfer",
      name: "Plaza mfer",
      role: "wanderer",
      x: 8.5,
      z: 6.5,
      yaw: -2.4,
      leashRadius: 9.5,
      dialogue: "Just wandering. The town already feels less empty.",
    },
    {
      id: "fountain-mfer",
      name: "Fountain mfer",
      role: "quest_giver",
      x: -7.5,
      z: -2.8,
      yaw: 1.6,
      leashRadius: 7.5,
      dialogue: "Daily vibes quest: chill by the fountain, then check back in.",
      questId: "fountain-vibes",
    },
    {
      id: "mfergpt",
      name: "mferGPT",
      role: "wanderer",
      model: "mfergpt",
      x: -10.2,
      z: -9.2,
      yaw: 2.55,
      leashRadius: 1.4,
      dialogue: "Say @mfergpt in chat if you need a quest hint, an arena test, or a town scan.",
    },
    {
      id: "hogwatch-mfer",
      name: "Hogwatch mfer",
      role: "quest_giver",
      x: -64.5,
      z: 64.5,
      yaw: -0.35,
      leashRadius: 1.3,
      dialogue: "The busted farm is making the roads rough. I could use a hand.",
      questId: "feral-farmers",
    },
    {
      id: "route-guard",
      name: "Route guard",
      role: "guard",
      x: -83.5,
      z: 60.8,
      yaw: -1.35,
      leashRadius: 5.5,
      dialogue: "Follow the dirt west, then north. Farm first, Field Camp after the hog run.",
    },
    {
      id: "field-guide-mfer",
      name: "Field Guide mfer",
      role: "quest_giver",
      x: -119.2,
      z: 132.4,
      yaw: 0.2,
      leashRadius: 1.4,
      dialogue: "Field Camp keeps the route board. Check the daily patrol before heading back.",
      questId: "route-patrol-daily",
    },
    {
      id: "pen-keeper-mfer",
      name: "Pen Keeper mfer",
      role: "quest_giver",
      x: -111.2,
      z: 136.7,
      yaw: -0.8,
      leashRadius: 1.2,
      dialogue: "The hog loop is never really done. I can post another sweep whenever you are ready.",
      questId: "hog-loop",
    },
    {
      id: "camp-merchant",
      name: "Camp merchant",
      role: "merchant",
      x: -125.3,
      z: 140.4,
      yaw: 1.45,
      leashRadius: 1.3,
      dialogue: "Field Camp supplies are basic, but the route is open.",
    },
    {
      id: "ridge-guide-mfer",
      name: "Ridge Guide mfer",
      role: "quest_giver",
      x: 108.8,
      z: -92.8,
      yaw: 2.05,
      leashRadius: 1.4,
      dialogue: "Signal Ridge is catching strange static from the relay crown.",
      questId: "signal-scraps",
    },
    {
      id: "beacon-keeper-mfer",
      name: "Beacon Keeper mfer",
      role: "quest_giver",
      x: 117.6,
      z: -91.2,
      yaw: 2.75,
      leashRadius: 1.4,
      dialogue: "The relay can call trouble down from miles away if you know the pattern.",
      questId: "cut-the-static",
    },
    {
      id: "ridge-merchant",
      name: "Ridge merchant",
      role: "merchant",
      x: 126.2,
      z: -88.8,
      yaw: -2.6,
      leashRadius: 1.3,
      dialogue: "No level gates here. Good gear comes from hard jobs and lucky drops.",
    },
    {
      id: "training-dummy-left",
      name: "Training dummy",
      role: "enemy",
      model: "mfer",
      x: -10.5,
      z: -11.5,
      yaw: 2.5,
      leashRadius: 0,
      health: 160,
      maxHealth: 160,
      isImmortal: true,
      dialogue: "The dummy looks ready to get bonked.",
    },
    {
      id: "training-dummy-right",
      name: "Training dummy",
      role: "enemy",
      model: "mfer",
      x: -7.8,
      z: -13.8,
      yaw: 2.2,
      leashRadius: 0,
      health: 160,
      maxHealth: 160,
      isImmortal: true,
      dialogue: "This dummy is for target practice.",
    },
    ...makeRabbitSpecs(),
    ...makeDeerSpecs(),
    ...makeWildHogSpecs(),
    ...makeFarmerSpecs(),
    ...makeRidgeRaiderSpecs(),
  ];

  for (const spec of specs) {
    spawnNpcFromSpec(npcs, spec);
  }
}

export function spawnNpcFromSpec(npcs: MapSchema<NpcState>, spec: NpcSpawnSpec, now = Date.now()) {
  const npc = new NpcState();
  npc.id = spec.id;
  npc.name = spec.name;
  npc.role = spec.role;
  npc.model = spec.model ?? "mfer";
  npc.avatarSeed = stableHash(`npc:${spec.id}`);
  npc.health = spec.health ?? 100;
  npc.maxHealth = spec.maxHealth ?? spec.health ?? 100;
  npc.isImmortal = Boolean(spec.isImmortal);
  const spawnPosition = resolveWorldCollision(spec.x, spec.z, getNpcCollisionRadius(npc));
  npc.x = spawnPosition.x;
  npc.y = 0;
  npc.z = spawnPosition.z;
  npc.yaw = spec.yaw;
  npc.animation = "idle";
  npc.dialogue = spec.dialogue;
  npc.questId = spec.questId ?? "";
  npc.homeX = npc.x;
  npc.homeZ = npc.z;
  npc.targetX = npc.x;
  npc.targetZ = npc.z;
  npc.leashRadius = spec.leashRadius;
  npc.combatStyle = spec.combatStyle ?? "";
  npc.nextDecisionAt = now + randomRange(1000, 5000);
  npcs.set(npc.id, npc);
  return npc;
}

function makeRabbitSpecs() {
  return [
    { id: "rabbit-north", x: -21.5, z: -20.5 },
    { id: "rabbit-plaza", x: 18.5, z: 10.2 },
    { id: "rabbit-grove", x: -28.2, z: 17.4 },
    { id: "rabbit-path", x: 24.4, z: -14.6 },
    { id: "rabbit-fountain", x: -15.3, z: -5.8 },
    { id: "rabbit-gate", x: 11.7, z: -27.5 },
  ].map((rabbit, index) => ({
    id: rabbit.id,
    name: "Rabbit",
    role: "critter" as NpcRole,
    model: "rabbit" as NpcModel,
    x: rabbit.x,
    z: rabbit.z,
    yaw: index * 0.9,
    leashRadius: 5.4,
    health: 1,
    maxHealth: 1,
    dialogue: "The rabbit wiggles its nose.",
  }));
}

function makeDeerSpecs() {
  return [
    { id: "deer-west", x: -33.5, z: -2.2 },
    { id: "deer-south", x: 29.5, z: 22.4 },
    { id: "deer-hill", x: -19.2, z: 30.2 },
    { id: "deer-copse", x: 34.8, z: -25.8 },
  ].map((deer, index) => ({
    id: deer.id,
    name: "Deer",
    role: "beast" as NpcRole,
    model: "deer" as NpcModel,
    x: deer.x,
    z: deer.z,
    yaw: Math.PI - index * 0.7,
    leashRadius: 7.2,
    health: 10,
    maxHealth: 10,
    dialogue: "The deer watches the plaza carefully.",
  }));
}

function makeWildHogSpecs() {
  return [
    { id: "wild-hog-rooter", x: -81.5, z: 88.2 },
    { id: "wild-hog-bristle", x: -76.8, z: 93.5 },
    { id: "wild-hog-snort", x: -89.2, z: 95.4 },
    { id: "wild-hog-mud", x: -71.4, z: 86.9 },
    { id: "wild-hog-runt", x: -94.8, z: 88.3 },
    { id: "wild-hog-tusk", x: -80.7, z: 80.1 },
    { id: "wild-hog-grub", x: -90.9, z: 78.8 },
    { id: "wild-hog-boar", x: -70.6, z: 101.4 },
    { id: "wild-hog-thistle", x: -98.4, z: 104.6 },
    { id: "wild-hog-burrow", x: -86.2, z: 111.8 },
    { id: "wild-hog-ridge", x: -76.4, z: 113.5 },
    { id: "wild-hog-camp", x: -102.8, z: 120.2 },
  ].map((hog, index) => ({
    id: hog.id,
    name: index === 7 ? "Old boar" : "Wild hog",
    role: "beast" as NpcRole,
    model: "hog" as NpcModel,
    x: hog.x,
    z: hog.z,
    yaw: Math.PI * 0.35 + index * 0.58,
    leashRadius: index === 7 ? 12.5 : 9.6,
    health: index === 7 ? 42 : 24,
    maxHealth: index === 7 ? 42 : 24,
    dialogue: index === 7 ? "The old boar paws at the broken fence." : "The wild hog snorts and roots through the mud.",
  }));
}

function makeFarmerSpecs() {
  return [
    { id: "farmhand-bran", name: "Farmhand Bran", x: -77.5, z: 86.5, yaw: -0.7, style: "melee" },
    { id: "farmhand-mae", name: "Farmhand Mae", x: -87.5, z: 91.5, yaw: 0.8, style: "melee" },
    { id: "field-mage-sol", name: "Field mage Sol", x: -73.2, z: 99.8, yaw: -1.6, style: "caster" },
    { id: "farmhand-jo", name: "Farmhand Jo", x: -94.5, z: 102.4, yaw: 0.4, style: "melee" },
    { id: "field-mage-ren", name: "Field mage Ren", x: -84.8, z: 108.6, yaw: 2.2, style: "caster" },
  ].map((farmer) => ({
    id: farmer.id,
    name: farmer.name,
    role: "farmer" as NpcRole,
    model: "mfer" as NpcModel,
    x: farmer.x,
    z: farmer.z,
    yaw: farmer.yaw,
    leashRadius: farmer.style === "caster" ? 10.5 : 9.5,
    health: farmer.style === "caster" ? 70 : 90,
    maxHealth: farmer.style === "caster" ? 70 : 90,
    combatStyle: farmer.style as "melee" | "caster",
    dialogue: farmer.style === "caster" ? "The field mage guards the busted farm." : "This farmer grips a pitchfork and watches the pen.",
  }));
}

function makeRidgeRaiderSpecs() {
  return [
    { id: "ridge-raider-vex", name: "Raider Vex", x: 145.5, z: -84.2, yaw: -2.4, style: "melee", health: 150 },
    { id: "ridge-raider-pax", name: "Raider Pax", x: 153.2, z: -95.8, yaw: 2.5, style: "melee", health: 150 },
    { id: "static-mage-ori", name: "Static mage Ori", x: 150.2, z: -113.4, yaw: -0.2, style: "caster", health: 135 },
    { id: "ridge-raider-loop", name: "Ridge raider", x: 142.0, z: -74.5, yaw: 1.1, style: "melee", health: 125 },
    { id: "ridge-raider-spark", name: "Ridge raider", x: 158.2, z: -106.2, yaw: -2.2, style: "caster", health: 125 },
    { id: "static-baron-nox", name: "Static Baron Nox", x: 151.5, z: -124.8, yaw: 2.85, style: "melee", health: 920 },
  ].map((raider) => ({
    id: raider.id,
    name: raider.name,
    role: "farmer" as NpcRole,
    model: "mfer" as NpcModel,
    x: raider.x,
    z: raider.z,
    yaw: raider.yaw,
    leashRadius: raider.id === "static-baron-nox" ? 16 : 10.5,
    health: raider.health,
    maxHealth: raider.health,
    combatStyle: raider.style as "melee" | "caster",
    dialogue: raider.id === "static-baron-nox"
      ? "The oversized mfer boss grips the relay mast and dares the ridge to rush him."
      : raider.style === "caster"
        ? "Static pops around this ridge mage's hands."
        : "This ridge raider is wired on relay static.",
  }));
}

export function updateNpcs(
  npcs: MapSchema<NpcState>,
  players: MapSchema<PlayerState>,
  delta: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  npcs.forEach((npc) => {
    if (!isNpcAlive(npc)) {
      if (npc.respawnAt > 0 && now >= npc.respawnAt) {
        npc.health = npc.maxHealth;
        npc.defeatedAt = 0;
        npc.despawnAt = 0;
        npc.respawnAt = 0;
        npc.aggroTargetId = "";
        npc.attackReadyAt = 0;
        npc.frozenUntil = 0;
        npc.hasLoot = false;
        npc.loot.clear();
        npc.x = npc.homeX;
        npc.y = 0;
        npc.z = npc.homeZ;
        npc.targetX = npc.homeX;
        npc.targetZ = npc.homeZ;
      } else if (npc.despawnAt > 0 && now >= npc.despawnAt) {
        npc.despawnAt = 0;
        npc.hasLoot = false;
        npc.loot.clear();
        npc.y = -1000;
        npc.animation = "idle";
        return;
      } else {
        npc.animation = "idle";
        return;
      }
    }

    if (npc.frozenUntil > 0) {
      if (now < npc.frozenUntil) {
        npc.animation = "idle";
        return;
      }
      npc.frozenUntil = 0;
    }

    if (npc.role === "farmer") {
      updateFarmerNpc(npc, players, delta, now, emitCombatEvent, pendingCombatImpacts);
      return;
    }

    if (npc.model === "hog" && npc.aggroTargetId) {
      updateHogNpc(npc, players, delta, now, emitCombatEvent, pendingCombatImpacts);
      return;
    }

    if (npc.role === "enemy") {
      npc.animation = "idle";
      return;
    }

    if (!isNpcNearAnyPlayer(npc, players, getNpcInterestRadius(npc))) {
      npc.animation = "idle";
      return;
    }

    const canWander = npc.role === "wanderer" || npc.role === "guard" || npc.role === "critter" || npc.role === "beast";
    const canPace = npc.role === "quest_giver" || npc.role === "merchant";
    const shouldPickTarget = now >= npc.nextDecisionAt
      || Math.hypot(npc.targetX - npc.x, npc.targetZ - npc.z) < 0.35;

    if (shouldPickTarget) {
      if (shouldNpcIdle(npc)) {
        npc.targetX = npc.x;
        npc.targetZ = npc.z;
        npc.animation = "idle";
        npc.nextDecisionAt = now + getNpcIdleDurationMs(npc);
        return;
      }

      if (canWander || (canPace && Math.random() < getNpcPaceChance(npc))) {
        const target = getNpcWanderTarget(npc);
        npc.targetX = target.x;
        npc.targetZ = target.z;
      } else {
        npc.targetX = npc.homeX;
        npc.targetZ = npc.homeZ;
      }
      npc.nextDecisionAt = now + getNpcWanderDecisionMs(npc);
    }

    const dx = npc.targetX - npc.x;
    const dz = npc.targetZ - npc.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) {
      npc.animation = "idle";
      return;
    }

    const speed = getNpcMoveSpeed(npc);
    const step = Math.min(distance, speed * delta);
    const previousX = npc.x;
    const previousZ = npc.z;
    const nextPosition = resolveWorldCollision(
      npc.x + (dx / distance) * step,
      npc.z + (dz / distance) * step,
      getNpcCollisionRadius(npc),
    );
    npc.x = nextPosition.x;
    npc.z = nextPosition.z;
    npc.yaw = Math.atan2(dx, dz);
    npc.animation = Math.hypot(npc.x - previousX, npc.z - previousZ) > 0.01 ? "walk" : "idle";
  });
}

function updateFarmerNpc(
  npc: NpcState,
  players: MapSchema<PlayerState>,
  delta: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  let target = npc.aggroTargetId ? players.get(npc.aggroTargetId) ?? null : null;
  if (!target || target.health <= 0 || distanceToHome(npc, target) > getFarmerLeashRange(npc)) {
    target = findNearestAggroPlayer(npc, players);
    npc.aggroTargetId = target ? getPlayerSessionId(players, target) : "";
  }

  if (!target) {
    npc.attackReadyAt = 0;
    return moveNpcToward(npc, npc.homeX, npc.homeZ, delta, 1.8);
  }

  const dx = target.x - npc.x;
  const dz = target.z - npc.z;
  const distance = Math.hypot(dx, dz);
  npc.yaw = Math.atan2(dx, dz);

  const isCaster = npc.combatStyle === "caster";
  const attackRange = getFarmerAttackRange(npc, isCaster);
  if (distance > attackRange * 0.82) {
    moveNpcToward(npc, target.x, target.z, delta, FARMER_COMBAT.moveSpeed);
    return;
  }

  npc.animation = "idle";
  if (now < npc.attackReadyAt) return;

  const actionId: CombatActionId = isCaster ? "fireblast" : "attack";
  const damage = getFarmerAttackDamage(npc, isCaster);
  npc.attackReadyAt = now + getFarmerAttackCooldownMs(npc, isCaster);
  applyNpcCombatDamage(npc, npc.aggroTargetId, target, actionId, damage, now, emitCombatEvent, pendingCombatImpacts);
}

function getFarmerAttackRange(npc: NpcState, isCaster: boolean) {
  if (npc.id === "raid-ogre-mfer") return 7.2;
  if (npc.id === "static-baron-nox") return 5.6;
  return isCaster ? FARMER_COMBAT.spellRange : FARMER_COMBAT.meleeRange;
}

function getFarmerAttackDamage(npc: NpcState, isCaster: boolean) {
  if (npc.id === "raid-ogre-mfer") return 38;
  if (npc.id === "static-baron-nox") return 24;
  return isCaster ? FARMER_COMBAT.spellDamage : FARMER_COMBAT.meleeDamage;
}

function getFarmerAttackCooldownMs(npc: NpcState, isCaster: boolean) {
  if (npc.id === "raid-ogre-mfer") return 1400;
  if (npc.id === "static-baron-nox") return 1500;
  return isCaster ? FARMER_COMBAT.spellCooldownMs : FARMER_COMBAT.meleeCooldownMs;
}

function updateHogNpc(
  npc: NpcState,
  players: MapSchema<PlayerState>,
  delta: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  const target = players.get(npc.aggroTargetId);
  if (!target || target.health <= 0 || distanceToHome(npc, target) > HOG_COMBAT.leashRange) {
    npc.aggroTargetId = "";
    npc.attackReadyAt = 0;
    npc.targetX = npc.homeX;
    npc.targetZ = npc.homeZ;
    npc.nextDecisionAt = now + getNpcWanderDecisionMs(npc);
    return moveNpcToward(npc, npc.homeX, npc.homeZ, delta, getNpcMoveSpeed(npc));
  }

  const dx = target.x - npc.x;
  const dz = target.z - npc.z;
  const distance = Math.hypot(dx, dz);
  npc.yaw = Math.atan2(dx, dz);

  if (distance > HOG_COMBAT.meleeRange * 0.85) {
    moveNpcToward(npc, target.x, target.z, delta, HOG_COMBAT.moveSpeed);
    return;
  }

  npc.animation = "idle";
  if (now < npc.attackReadyAt) return;

  npc.attackReadyAt = now + HOG_COMBAT.meleeCooldownMs;
  applyNpcCombatDamage(npc, npc.aggroTargetId, target, "attack", HOG_COMBAT.meleeDamage, now, emitCombatEvent, pendingCombatImpacts);
}

function findNearestAggroPlayer(npc: NpcState, players: MapSchema<PlayerState>) {
  let nearest: PlayerState | null = null;
  let nearestDistance = Infinity;
  players.forEach((player) => {
    if (player.health <= 0) return;
    const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
    if (distance > FARMER_COMBAT.aggroRange || distanceToHome(npc, player) > FARMER_COMBAT.leashRange) return;
    if (distance < nearestDistance) {
      nearest = player;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function getFarmerLeashRange(npc: NpcState) {
  if (npc.id === "raid-ogre-mfer") return 82;
  if (npc.id === "static-baron-nox") return 56;
  if (!npc.aggroTargetId) return FARMER_COMBAT.leashRange;
  return Math.max(FARMER_COMBAT.leashRange, COMBAT.actions.fireblast.maxRange + 2);
}

function getPlayerSessionId(players: MapSchema<PlayerState>, target: PlayerState) {
  let found = "";
  players.forEach((player, sessionId) => {
    if (player === target) found = sessionId;
  });
  return found;
}

function moveNpcToward(npc: NpcState, x: number, z: number, delta: number, speed: number) {
  const dx = x - npc.x;
  const dz = z - npc.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.12) {
    npc.animation = "idle";
    return;
  }

  const step = Math.min(distance, speed * delta);
  const previousX = npc.x;
  const previousZ = npc.z;
  const nextPosition = resolveWorldCollision(
    npc.x + (dx / distance) * step,
    npc.z + (dz / distance) * step,
    getNpcCollisionRadius(npc),
  );
  npc.x = nextPosition.x;
  npc.z = nextPosition.z;
  npc.yaw = Math.atan2(dx, dz);
  npc.animation = Math.hypot(npc.x - previousX, npc.z - previousZ) > 0.01 ? "run" : "idle";
}

function distanceToHome(npc: NpcState, point: { x: number; z: number }) {
  return Math.hypot(point.x - npc.homeX, point.z - npc.homeZ);
}

function getNpcWanderTarget(npc: NpcState) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * npc.leashRadius;
  return {
    ...resolveWorldCollision(
      npc.homeX + Math.cos(angle) * radius,
      npc.homeZ + Math.sin(angle) * radius,
      getNpcCollisionRadius(npc),
    ),
  };
}

function getNpcMoveSpeed(npc: NpcState) {
  if (npc.role === "guard") return 2.35;
  if (npc.role === "critter") return 2.65;
  if (npc.model === "hog") return 2.0;
  if (npc.role === "beast") return 2.2;
  return 1.85;
}

function getNpcCollisionRadius(npc: NpcState) {
  if (npc.id === "raid-ogre-mfer") return 1.8;
  if (npc.id === "static-baron-nox") return 1.05;
  if (npc.model === "rabbit") return 0.36;
  if (npc.model === "hog") return 0.74;
  if (npc.model === "deer") return 0.62;
  return PLAYER.radius;
}

function getNpcInterestRadius(npc: NpcState) {
  if (npc.role === "critter" || npc.role === "beast") return 34;
  if (npc.role === "wanderer" || npc.role === "guard") return 42;
  return 28;
}

function shouldNpcIdle(npc: NpcState) {
  if (npc.role === "critter") return Math.random() < 0.62;
  if (npc.role === "beast") return Math.random() < 0.55;
  if (npc.role === "wanderer" || npc.role === "guard") return Math.random() < 0.82;
  if (npc.role === "quest_giver" || npc.role === "merchant") return Math.random() < 0.94;
  return false;
}

function getNpcIdleDurationMs(npc: NpcState) {
  if (npc.role === "critter") return randomRange(1600, 4200);
  if (npc.role === "beast") return randomRange(2200, 6200);
  if (npc.role === "wanderer" || npc.role === "guard") return randomRange(9000, 22000);
  if (npc.role === "quest_giver" || npc.role === "merchant") return randomRange(16000, 38000);
  return randomRange(5500, 12000);
}

function getNpcWanderDecisionMs(npc: NpcState) {
  if (npc.role === "critter") return randomRange(3000, 8000);
  if (npc.role === "beast") return randomRange(4500, 11000);
  if (npc.role === "wanderer" || npc.role === "guard") return randomRange(9000, 22000);
  if (npc.role === "quest_giver" || npc.role === "merchant") return randomRange(14000, 32000);
  return randomRange(5000, 12000);
}

function getNpcPaceChance(npc: NpcState) {
  if (npc.role === "quest_giver" || npc.role === "merchant") return 0.08;
  return 0.35;
}

function isNpcNearAnyPlayer(npc: NpcState, players: MapSchema<PlayerState>, radius: number) {
  let isNear = false;
  players.forEach((player) => {
    if (isNear || player.health <= 0) return;
    isNear = Math.hypot(player.x - npc.x, player.z - npc.z) <= radius;
  });
  return isNear;
}

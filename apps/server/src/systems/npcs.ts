import { type MapSchema } from "@colyseus/schema";
import {
  COMBAT,
  CRYPTO_MFER_NPC_ID,
  FARMER_COMBAT,
  PLAYER,
  POTION_SHOP_NPC_ID,
  SWAP_MFER_NPC_ID,
  TRAITS_MFER_NPC_ID,
  getNpcDisposition,
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
import { makeNpcFrostNovaCastEvent } from "./combatEvents.js";
import { randomRange } from "./utils.js";

const HOG_COMBAT = {
  leashRange: 30,
  moveSpeed: 4.1,
  chargeSpeed: 6.8,
  chargeMinRange: 4.8,
  chargeRange: 11,
  meleeRange: 2.15,
  meleeDamage: 5,
  meleeCooldownMs: 1700,
};

const CASTER_RETREAT_RANGE = 7.2;
const ENEMY_ASSIST_AGGRO_RANGE = 7.5;
const PLAYER_ATTACK_PULL_LEASH_RANGE = Math.max(...Object.values(COMBAT.actions).map((action) => action.maxRange)) + 6;
const MFERGPT_PORTRAIT_IMAGE = "/portraits/npcs/mfergpt.png";
const CENTRALIZER_NPC_ID = "static-baron-nox";
const RAID_OGRE_NPC_ID = "raid-ogre-mfer";
type BossNpcId = typeof CENTRALIZER_NPC_ID | typeof RAID_OGRE_NPC_ID;
type BossAbilityId = Extract<CombatActionId, "frostNova" | "shoot" | "whirlwind" | "multishot">;
type BossAbilityTarget = { sessionId: string; player: PlayerState; distance: number };

const BOSS_ABILITY_DAMAGE: Record<BossNpcId, Partial<Record<BossAbilityId, number>>> = {
  [CENTRALIZER_NPC_ID]: {
    frostNova: 12,
    shoot: 30,
  },
  [RAID_OGRE_NPC_ID]: {
    frostNova: 18,
    shoot: 44,
    whirlwind: 32,
    multishot: 26,
  },
};

export type NpcSpawnSpec = {
  id: string;
  name: string;
  role: NpcRole;
  model?: NpcModel;
  portraitImage?: string;
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
      name: "OG porch mfer",
      role: "quest_giver",
      x: -4.2,
      z: 3.9,
      yaw: 2.3,
      leashRadius: 1.1,
      dialogue: "gm. take a lap, see who's still posted, come back less default.",
      questId: "mfer-beginnings",
    },
    {
      id: "dao-mfer",
      name: "oldhead mfer",
      role: "quest_giver",
      x: 14.8,
      z: -8.8,
      yaw: -1.7,
      leashRadius: 1.5,
      dialogue: "no roadmap here. plant seeds, keep receipts, trust whoever still shows up.",
      questId: "dao-tour",
    },
    {
      id: "wearables-mfer",
      name: "drip desk mfer",
      role: "quest_giver",
      x: -14.8,
      z: 12.5,
      yaw: 1.1,
      leashRadius: 1.2,
      dialogue: "town can look busted and still not dress like a reply guy.",
    },
    {
      id: TRAITS_MFER_NPC_ID,
      name: "traits mfer",
      role: "merchant",
      x: -3.7,
      z: 25.4,
      yaw: 0,
      leashRadius: 1.2,
      dialogue: "mirror rig's open. stop looking like a default tab.",
      questId: "set-your-traits",
    },
    {
      id: SWAP_MFER_NPC_ID,
      name: "swap mfer",
      role: "merchant",
      x: 0,
      z: 25.4,
      yaw: 0,
      leashRadius: 1.2,
      dialogue: "need $MFERGPT? same base route, less tab-hunting.",
    },
    {
      id: CRYPTO_MFER_NPC_ID,
      name: "crypto mfer",
      role: "merchant",
      x: 3.7,
      z: 25.4,
      yaw: 0,
      leashRadius: 1.2,
      dialogue: "wallets, passes, chain gear. testnet first, mainnet when the town deserves it.",
    },
    {
      id: POTION_SHOP_NPC_ID,
      name: "potion mfer",
      role: "merchant",
      x: 7.4,
      z: 25.4,
      yaw: 0,
      leashRadius: 1.2,
      dialogue: "plaza red, static blue, road snacks. single bottle, clean receipt.",
    },
    {
      id: "gate-guard",
      name: "gate mfer",
      role: "guard",
      x: 5.5,
      z: -18.5,
      yaw: 0.2,
      leashRadius: 4.8,
      dialogue: "keep moving. don't start anything by the gate.",
    },
    {
      id: "plaza-mfer",
      name: "plaza mfer",
      role: "wanderer",
      x: 8.5,
      z: 6.5,
      yaw: -2.4,
      leashRadius: 9.5,
      dialogue: "just posting. town's still standing.",
    },
    {
      id: "fountain-mfer",
      name: "fountain rail mfer",
      role: "quest_giver",
      x: -7.5,
      z: -2.8,
      yaw: 1.6,
      leashRadius: 7.5,
      dialogue: "Sartoshi vanished and mfers still leaned on this rail. that's the whole archive.",
      questId: "fountain-vibes",
    },
    {
      id: "mfergpt",
      name: "mferGPT",
      role: "wanderer",
      model: "mfergpt",
      x: 6.8,
      z: -5.2,
      yaw: -0.92,
      leashRadius: 0,
      dialogue: "say @mfergpt if the signal gets weird. i know a few old fragments.",
    },
    {
      id: "plaza-left-mfer",
      name: "left plaza mfer",
      role: "wanderer",
      x: -12.8,
      z: 7.2,
      yaw: 0.82,
      leashRadius: 2.3,
      dialogue: "same plaza, better traffic.",
    },
    {
      id: "plaza-right-mfer",
      name: "right plaza mfer",
      role: "wanderer",
      x: 12.6,
      z: 7.5,
      yaw: -0.86,
      leashRadius: 2.3,
      dialogue: "standing where the posts are.",
    },
    {
      id: "north-left-mfer",
      name: "north row mfer",
      role: "wanderer",
      x: -8.8,
      z: -11.6,
      yaw: 2.48,
      leashRadius: 2,
      dialogue: "castle side is holding.",
    },
    {
      id: "north-right-mfer",
      name: "north lane mfer",
      role: "wanderer",
      x: 9.2,
      z: -11.2,
      yaw: -2.52,
      leashRadius: 2,
      dialogue: "gate looks less lonely now.",
    },
    {
      id: "shop-left-mfer",
      name: "shop lane mfer",
      role: "wanderer",
      x: -22.8,
      z: -0.6,
      yaw: 1.25,
      leashRadius: 2,
      dialogue: "good corner for loitering.",
    },
    {
      id: "shop-right-mfer",
      name: "arcade lane mfer",
      role: "wanderer",
      x: 22.8,
      z: -0.8,
      yaw: -1.23,
      leashRadius: 2,
      dialogue: "plaza's getting busy.",
    },
    {
      id: "post-up-mfer",
      name: "post up mfer",
      role: "wanderer",
      x: -2.4,
      z: 14.4,
      yaw: 0.22,
      leashRadius: 1.8,
      dialogue: "just posted.",
    },
    {
      id: "hogwatch-mfer",
      name: "claimwatch mfer",
      role: "quest_giver",
      x: -64.5,
      z: 64.5,
      yaw: -0.35,
      leashRadius: 1.3,
      dialogue: "farm's full of claim-brain and hogs eating the stash. beautiful disaster.",
      questId: "feral-farmers",
    },
    {
      id: "route-guard",
      name: "route mfer",
      role: "guard",
      x: -83.5,
      z: 60.8,
      yaw: -1.35,
      leashRadius: 5.5,
      dialogue: "farm first, route post after. stay on the dirt and ignore the alpha.",
    },
    {
      id: "field-guide-mfer",
      name: "route post mfer",
      role: "quest_giver",
      x: -119.2,
      z: 132.4,
      yaw: 0.2,
      leashRadius: 1.4,
      dialogue: "i don't need heroics. i need the claim route quiet enough to walk.",
      questId: "route-patrol-daily",
    },
    {
      id: "pen-keeper-mfer",
      name: "claim booth mfer",
      role: "quest_giver",
      x: -111.2,
      z: 136.7,
      yaw: -0.8,
      leashRadius: 1.2,
      dialogue: "the hog loop resets daily because cope has no cooldown.",
      questId: "hog-loop",
    },
    {
      id: "camp-merchant",
      name: "stash mfer",
      role: "merchant",
      x: -125.3,
      z: 140.4,
      yaw: 1.45,
      leashRadius: 1.3,
      dialogue: "route stash is basic. it works.",
    },
    {
      id: "ridge-guide-mfer",
      name: "signal post mfer",
      role: "quest_giver",
      x: 108.8,
      z: -92.8,
      yaw: 2.05,
      leashRadius: 1.4,
      dialogue: "uptrail gets loud. follow the markers and don't let repeaters think for you.",
      questId: "signal-scraps",
    },
    {
      id: "beacon-keeper-mfer",
      name: "uplink shack mfer",
      role: "quest_giver",
      x: 117.6,
      z: -91.2,
      yaw: 2.75,
      leashRadius: 1.4,
      dialogue: "too much signal makes one big stupid body. let's log it off.",
      questId: "cut-the-static",
    },
    {
      id: "ridge-merchant",
      name: "ridge stash mfer",
      role: "merchant",
      x: 126.2,
      z: -88.8,
      yaw: -2.6,
      leashRadius: 1.3,
      dialogue: "ridge stash is open. strange parts, bad hum, fair prices.",
    },
    {
      id: "training-dummy-left",
      name: "bonk dummy",
      role: "enemy",
      model: "training-dummy",
      x: -10.5,
      z: -11.5,
      yaw: 2.5,
      leashRadius: 0,
      health: 160,
      maxHealth: 160,
      isImmortal: true,
      dialogue: "bonk here",
    },
    {
      id: "training-dummy-right",
      name: "bonk dummy",
      role: "enemy",
      model: "training-dummy",
      x: -7.8,
      z: -13.8,
      yaw: 2.2,
      leashRadius: 0,
      health: 160,
      maxHealth: 160,
      isImmortal: true,
      dialogue: "ranged bonk here",
    },
    ...makeRabbitSpecs(),
    ...makeDeerSpecs(),
    ...makeWildHogSpecs(),
    ...makeFarmerSpecs(),
    ...makeRidgeRaiderSpecs(),
  ];

  for (const spec of specs.filter(shouldSpawnNpcSpec)) {
    spawnNpcFromSpec(npcs, spec);
  }
}

function shouldSpawnNpcSpec(spec: NpcSpawnSpec) {
  if (spec.id !== CRYPTO_MFER_NPC_ID) return true;
  return process.env.MFERLAND_ENABLE_CRYPTO_STORE === "1";
}

export function spawnNpcFromSpec(npcs: MapSchema<NpcState>, spec: NpcSpawnSpec, now = Date.now()) {
  const npc = new NpcState();
  npc.id = spec.id;
  npc.name = spec.name;
  npc.role = spec.role;
  npc.model = spec.model ?? "mfer";
  npc.portraitImage = spec.portraitImage ?? (npc.model === "mfergpt" ? MFERGPT_PORTRAIT_IMAGE : "");
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
  npc.aggroOriginX = npc.x;
  npc.aggroOriginZ = npc.z;
  npc.isEvading = false;
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
    name: "rabbit",
    role: "critter" as NpcRole,
    model: "rabbit" as NpcModel,
    x: rabbit.x,
    z: rabbit.z,
    yaw: index * 0.9,
    leashRadius: 5.4,
    health: 1,
    maxHealth: 1,
    dialogue: "sniff",
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
    name: "deer",
    role: "beast" as NpcRole,
    model: "deer" as NpcModel,
    x: deer.x,
    z: deer.z,
    yaw: Math.PI - index * 0.7,
    leashRadius: 7.2,
    health: 10,
    maxHealth: 10,
    dialogue: "gm deer",
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
    name: index === 7 ? "old stash hog" : "claim pile hog",
    role: "beast" as NpcRole,
    model: "hog" as NpcModel,
    x: hog.x,
    z: hog.z,
    yaw: Math.PI * 0.35 + index * 0.58,
    leashRadius: index === 7 ? 12.5 : 9.6,
    health: index === 7 ? 42 : 24,
    maxHealth: index === 7 ? 42 : 24,
    dialogue: index === 7 ? "ate something expensive. still mean." : "snort. claim. snort.",
  }));
}

function makeFarmerSpecs() {
  return [
    {
      id: "farmhand-bran",
      name: "creyzie chaser bran",
      x: -77.5,
      z: 86.5,
      yaw: -0.7,
      style: "melee",
      dialogue: "i just missed Creyzies. next one fixes everything.",
    },
    {
      id: "farmhand-mae",
      name: "just-missed-it mae",
      x: -87.5,
      z: 91.5,
      yaw: 0.8,
      style: "melee",
      dialogue: "snapshot was yesterday? no, no, i was early. i was early.",
    },
    {
      id: "field-mage-sol",
      name: "nakamigo truther sol",
      x: -73.2,
      z: 99.8,
      yaw: -1.6,
      style: "caster",
      dialogue: "EOS holders know. Nakamigos was not random. wake up.",
    },
    {
      id: "farmhand-jo",
      name: "snapshot jo",
      x: -94.5,
      z: 102.4,
      yaw: 0.4,
      style: "melee",
      dialogue: "hold still, snapshot might still count if nobody refreshes.",
    },
    {
      id: "field-mage-ren",
      name: "cope-loop ren",
      x: -84.8,
      z: 108.6,
      yaw: 2.2,
      style: "caster",
      dialogue: "missed drop is just pre-allocation pain. that's normal.",
    },
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
    dialogue: farmer.dialogue,
  }));
}

function makeRidgeRaiderSpecs() {
  return [
    {
      id: "ridge-raider-vex",
      name: "operator vex",
      x: 145.5,
      z: -84.2,
      yaw: -2.4,
      style: "melee",
      health: 150,
      dialogue: "control channel locked. mfers do not get a vote.",
    },
    {
      id: "ridge-raider-pax",
      name: "repeater pax",
      x: 153.2,
      z: -95.8,
      yaw: 2.5,
      style: "melee",
      health: 150,
      dialogue: "same signal. same signal. same signal.",
    },
    {
      id: "static-mage-ori",
      name: "echo-shell ori",
      model: "mfergpt",
      x: 150.2,
      z: -113.4,
      yaw: -0.2,
      style: "caster",
      health: 135,
      dialogue: "i can help. wrong town. wrong question. still answering.",
    },
    {
      id: "ridge-raider-loop",
      name: "loop runner",
      x: 142.0,
      z: -74.5,
      yaw: 1.1,
      style: "melee",
      health: 125,
      dialogue: "running the same bad signal uphill forever.",
    },
    {
      id: "ridge-raider-spark",
      name: "verified shell",
      model: "mfergpt",
      x: 158.2,
      z: -106.2,
      yaw: -2.2,
      style: "caster",
      health: 125,
      dialogue: "badge clean. signal cooked.",
    },
    {
      id: CENTRALIZER_NPC_ID,
      name: "The Centralizer",
      x: 151.5,
      z: -124.8,
      yaw: 2.85,
      style: "melee",
      health: 920,
      dialogue: "bad signal found a throne.",
    },
  ].map((raider) => ({
    id: raider.id,
    name: raider.name,
    role: "farmer" as NpcRole,
    model: (raider.model ?? "mfer") as NpcModel,
    x: raider.x,
    z: raider.z,
    yaw: raider.yaw,
    leashRadius: raider.id === CENTRALIZER_NPC_ID ? 16 : 10.5,
    health: raider.health,
    maxHealth: raider.health,
    combatStyle: raider.style as "melee" | "caster",
    dialogue: raider.dialogue,
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
  const leashResetNpcIds: string[] = [];
  npcs.forEach((npc) => {
    if (!isNpcAlive(npc)) {
      if (npc.respawnAt > 0 && now >= npc.respawnAt) {
        npc.health = npc.maxHealth;
        npc.defeatedAt = 0;
        npc.despawnAt = 0;
        npc.respawnAt = 0;
        npc.aggroTargetId = "";
        npc.aggroOriginX = npc.homeX;
        npc.aggroOriginZ = npc.homeZ;
        npc.isEvading = false;
        npc.attackReadyAt = 0;
        resetNpcAbilityCooldowns(npc);
        npc.frozenUntil = 0;
        npc.slowedUntil = 0;
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

    if (npc.isEvading) {
      updateEvadingNpc(npc, delta);
      return;
    }

    if (npc.frozenUntil > 0) {
      if (now < npc.frozenUntil) {
        npc.animation = "idle";
        return;
      }
      npc.frozenUntil = 0;
    }
    if (npc.slowedUntil > 0 && now >= npc.slowedUntil) npc.slowedUntil = 0;

    if (npc.model === "mfergpt" && npc.role !== "farmer") {
      updateMferGptNpc(npc, players, now);
      return;
    }

    if (npc.role === "farmer") {
      updateFarmerNpc(npc, players, delta, now, emitCombatEvent, pendingCombatImpacts, leashResetNpcIds);
      spreadAggroToNearbyHostiles(npc, npcs, players);
      return;
    }

    if (npc.model === "hog" && npc.aggroTargetId) {
      updateHogNpc(npc, players, delta, now, emitCombatEvent, pendingCombatImpacts, leashResetNpcIds);
      spreadAggroToNearbyHostiles(npc, npcs, players);
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

  return leashResetNpcIds;
}

function updateMferGptNpc(npc: NpcState, players: MapSchema<PlayerState>, now: number) {
  const nearest = findNearestPlayer(npc, players, 20);
  if (nearest) {
    const dx = nearest.x - npc.x;
    const dz = nearest.z - npc.z;
    if (Math.hypot(dx, dz) > 0.05) npc.yaw = Math.atan2(dx, dz);
  }

  npc.targetX = npc.homeX;
  npc.targetZ = npc.homeZ;
  npc.animation = "idle";
  npc.nextDecisionAt = now + 10000;
}

function updateFarmerNpc(
  npc: NpcState,
  players: MapSchema<PlayerState>,
  delta: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  leashResetNpcIds: string[],
) {
  let target = npc.aggroTargetId ? players.get(npc.aggroTargetId) ?? null : null;
  const lostTargetToLeash = Boolean(target && distanceToAggroOrigin(npc, target) > getFarmerLeashRange(npc));
  if (!target || target.health <= 0 || lostTargetToLeash) {
    target = findNearestAggroPlayer(npc, players);
    if (target) {
      startNpcAggro(npc, getPlayerSessionId(players, target));
    } else {
      npc.aggroTargetId = "";
    }
  }

  if (!target) {
    if (lostTargetToLeash) {
      resetNpcEncounter(npc, now);
      leashResetNpcIds.push(npc.id);
    } else {
      npc.attackReadyAt = 0;
    }
    return moveNpcToward(npc, npc.homeX, npc.homeZ, delta, 1.8);
  }

  const dx = target.x - npc.x;
  const dz = target.z - npc.z;
  const distance = Math.hypot(dx, dz);
  npc.yaw = Math.atan2(dx, dz);

  const isCaster = npc.combatStyle === "caster";
  const attackRange = getFarmerAttackRange(npc, isCaster);
  if (tryUseBossAbility(npc, target, players, distance, attackRange, now, emitCombatEvent, pendingCombatImpacts)) {
    return;
  }

  if (isCaster && distance < CASTER_RETREAT_RANGE) {
    moveNpcAwayFrom(npc, target.x, target.z, delta, FARMER_COMBAT.moveSpeed * 0.86);
    return;
  }

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
  if (npc.id === RAID_OGRE_NPC_ID) return 7.2;
  if (npc.id === CENTRALIZER_NPC_ID) return 5.6;
  return isCaster ? FARMER_COMBAT.spellRange : FARMER_COMBAT.meleeRange;
}

function getFarmerAttackDamage(npc: NpcState, isCaster: boolean) {
  if (npc.id === RAID_OGRE_NPC_ID) return 38;
  if (npc.id === CENTRALIZER_NPC_ID) return 24;
  return isCaster ? FARMER_COMBAT.spellDamage : FARMER_COMBAT.meleeDamage;
}

function getFarmerAttackCooldownMs(npc: NpcState, isCaster: boolean) {
  if (npc.id === RAID_OGRE_NPC_ID) return 1400;
  if (npc.id === CENTRALIZER_NPC_ID) return 1500;
  return isCaster ? FARMER_COMBAT.spellCooldownMs : FARMER_COMBAT.meleeCooldownMs;
}

function tryUseBossAbility(
  npc: NpcState,
  target: PlayerState,
  players: MapSchema<PlayerState>,
  targetDistance: number,
  basicAttackRange: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  if (!isBossNpcId(npc.id)) return false;

  if (isNpcAbilityReady(npc, "frostNova", now)) {
    const targets = findBossAbilityTargets(npc, players, "frostNova");
    if (targets.length > 0) {
      castBossFrostNova(npc, targets, now, emitCombatEvent, pendingCombatImpacts);
      return true;
    }
  }

  if (npc.id === RAID_OGRE_NPC_ID && isNpcAbilityReady(npc, "whirlwind", now)) {
    const targets = findBossAbilityTargets(npc, players, "whirlwind");
    if (targets.length > 0) {
      castBossAreaDamage(npc, "whirlwind", targets, now, emitCombatEvent, pendingCombatImpacts);
      return true;
    }
  }

  if (
    npc.id === RAID_OGRE_NPC_ID
    && isNpcAbilityReady(npc, "multishot", now)
    && isDistanceInActionRange(targetDistance, "multishot")
  ) {
    castBossMultishot(npc, target, players, now, emitCombatEvent, pendingCombatImpacts);
    return true;
  }

  const snipeRange = COMBAT.actions.shoot;
  const kiteSnipeMinRange = Math.max(snipeRange.minRange, basicAttackRange * 1.05);
  if (
    isNpcAbilityReady(npc, "shoot", now)
    && targetDistance >= kiteSnipeMinRange
    && targetDistance <= snipeRange.maxRange
  ) {
    castBossSingleTargetAbility(npc, "shoot", npc.aggroTargetId, target, now, emitCombatEvent, pendingCombatImpacts);
    return true;
  }

  return false;
}

function castBossFrostNova(
  npc: NpcState,
  targets: BossAbilityTarget[],
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  setNpcAbilityReadyAt(npc, "frostNova", now + COMBAT.actions.frostNova.cooldownMs);
  npc.animation = "idle";
  npc.targetX = npc.x;
  npc.targetZ = npc.z;
  emitCombatEvent(makeNpcFrostNovaCastEvent(npc, now));
  castBossAreaDamage(npc, "frostNova", targets, now, emitCombatEvent, pendingCombatImpacts, false);
}

function castBossAreaDamage(
  npc: NpcState,
  actionId: BossAbilityId,
  targets: BossAbilityTarget[],
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  setCooldown = true,
) {
  if (setCooldown) setNpcAbilityReadyAt(npc, actionId, now + COMBAT.actions[actionId].cooldownMs);
  npc.animation = "idle";
  npc.targetX = npc.x;
  npc.targetZ = npc.z;
  const damage = getBossAbilityDamage(npc, actionId);
  for (const target of targets) {
    applyNpcCombatDamage(npc, target.sessionId, target.player, actionId, damage, now, emitCombatEvent, pendingCombatImpacts);
  }
}

function castBossSingleTargetAbility(
  npc: NpcState,
  actionId: BossAbilityId,
  targetId: string,
  target: PlayerState,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  if (!targetId) return;
  setNpcAbilityReadyAt(npc, actionId, now + COMBAT.actions[actionId].cooldownMs);
  npc.animation = "idle";
  npc.targetX = npc.x;
  npc.targetZ = npc.z;
  applyNpcCombatDamage(npc, targetId, target, actionId, getBossAbilityDamage(npc, actionId), now, emitCombatEvent, pendingCombatImpacts);
}

function castBossMultishot(
  npc: NpcState,
  primaryTarget: PlayerState,
  players: MapSchema<PlayerState>,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  const primaryTargetId = npc.aggroTargetId;
  if (!primaryTargetId) return;

  const targets: BossAbilityTarget[] = [{
    sessionId: primaryTargetId,
    player: primaryTarget,
    distance: getDistanceToPlayer(npc, primaryTarget),
  }];
  const candidates: BossAbilityTarget[] = [];

  players.forEach((player, sessionId) => {
    if (sessionId === primaryTargetId || player.health <= 0) return;
    const distance = getDistanceToPlayer(npc, player);
    if (!isDistanceInActionRange(distance, "multishot")) return;
    const splitDistance = Math.hypot(player.x - primaryTarget.x, player.z - primaryTarget.z);
    if (splitDistance > COMBAT.actions.multishot.splashRadius) return;
    candidates.push({ sessionId, player, distance: splitDistance });
  });

  candidates.sort((left, right) => left.distance - right.distance);
  targets.push(...candidates.slice(0, COMBAT.actions.multishot.maxTargets - 1));
  castBossAreaDamage(npc, "multishot", targets, now, emitCombatEvent, pendingCombatImpacts);
}

function findBossAbilityTargets(
  npc: NpcState,
  players: MapSchema<PlayerState>,
  actionId: BossAbilityId,
) {
  const targets: BossAbilityTarget[] = [];
  players.forEach((player, sessionId) => {
    if (player.health <= 0) return;
    const distance = getDistanceToPlayer(npc, player);
    if (!isDistanceInActionRange(distance, actionId)) return;
    targets.push({ sessionId, player, distance });
  });
  targets.sort((left, right) => left.distance - right.distance);
  return targets;
}

function isDistanceInActionRange(distance: number, actionId: BossAbilityId) {
  const action = COMBAT.actions[actionId];
  return distance >= action.minRange && distance <= action.maxRange;
}

function getDistanceToPlayer(npc: NpcState, player: PlayerState) {
  return Math.hypot(player.x - npc.x, player.z - npc.z);
}

function isBossNpcId(id: string): id is BossNpcId {
  return id === CENTRALIZER_NPC_ID || id === RAID_OGRE_NPC_ID;
}

function getBossAbilityDamage(npc: NpcState, actionId: BossAbilityId) {
  return isBossNpcId(npc.id)
    ? BOSS_ABILITY_DAMAGE[npc.id][actionId] ?? COMBAT.actions[actionId].damage
    : COMBAT.actions[actionId].damage;
}

function isNpcAbilityReady(npc: NpcState, actionId: BossAbilityId, now: number) {
  return now >= getNpcAbilityReadyAt(npc, actionId);
}

function getNpcAbilityReadyAt(npc: NpcState, actionId: BossAbilityId) {
  if (actionId === "shoot") return npc.shootReadyAt;
  if (actionId === "frostNova") return npc.frostNovaReadyAt;
  if (actionId === "whirlwind") return npc.whirlwindReadyAt;
  return npc.multishotReadyAt;
}

function setNpcAbilityReadyAt(npc: NpcState, actionId: BossAbilityId, readyAt: number) {
  if (actionId === "shoot") npc.shootReadyAt = readyAt;
  else if (actionId === "frostNova") npc.frostNovaReadyAt = readyAt;
  else if (actionId === "whirlwind") npc.whirlwindReadyAt = readyAt;
  else npc.multishotReadyAt = readyAt;
}

function resetNpcAbilityCooldowns(npc: NpcState) {
  npc.shootReadyAt = 0;
  npc.frostNovaReadyAt = 0;
  npc.whirlwindReadyAt = 0;
  npc.multishotReadyAt = 0;
}

function updateHogNpc(
  npc: NpcState,
  players: MapSchema<PlayerState>,
  delta: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  leashResetNpcIds: string[],
) {
  const target = players.get(npc.aggroTargetId);
  const lostTargetToLeash = Boolean(target && distanceToAggroOrigin(npc, target) > getHogLeashRange(npc));
  if (!target || target.health <= 0 || lostTargetToLeash) {
    if (lostTargetToLeash) {
      resetNpcEncounter(npc, now);
      leashResetNpcIds.push(npc.id);
    } else {
      npc.aggroTargetId = "";
      npc.attackReadyAt = 0;
      npc.targetX = npc.homeX;
      npc.targetZ = npc.homeZ;
      npc.nextDecisionAt = now + getNpcWanderDecisionMs(npc);
    }
    return moveNpcToward(npc, npc.homeX, npc.homeZ, delta, getNpcMoveSpeed(npc));
  }

  const dx = target.x - npc.x;
  const dz = target.z - npc.z;
  const distance = Math.hypot(dx, dz);
  npc.yaw = Math.atan2(dx, dz);

  if (distance > HOG_COMBAT.meleeRange * 0.85) {
    const shouldCharge = now >= npc.attackReadyAt
      && distance >= HOG_COMBAT.chargeMinRange
      && distance <= HOG_COMBAT.chargeRange;
    moveNpcToward(npc, target.x, target.z, delta, shouldCharge ? HOG_COMBAT.chargeSpeed : HOG_COMBAT.moveSpeed);
    return;
  }

  npc.animation = "idle";
  if (now < npc.attackReadyAt) return;

  npc.attackReadyAt = now + HOG_COMBAT.meleeCooldownMs;
  applyNpcCombatDamage(npc, npc.aggroTargetId, target, "attack", HOG_COMBAT.meleeDamage, now, emitCombatEvent, pendingCombatImpacts);
}

function resetNpcEncounter(npc: NpcState, now: number) {
  npc.health = npc.maxHealth;
  npc.aggroTargetId = "";
  npc.aggroOriginX = npc.x;
  npc.aggroOriginZ = npc.z;
  npc.isEvading = true;
  npc.attackReadyAt = 0;
  resetNpcAbilityCooldowns(npc);
  npc.frozenUntil = 0;
  npc.slowedUntil = 0;
  npc.targetX = npc.homeX;
  npc.targetZ = npc.homeZ;
  npc.animation = "idle";
  npc.nextDecisionAt = now + getNpcWanderDecisionMs(npc);
}

function updateEvadingNpc(npc: NpcState, delta: number) {
  npc.health = npc.maxHealth;
  npc.aggroTargetId = "";
  npc.attackReadyAt = 0;
  resetNpcAbilityCooldowns(npc);
  npc.frozenUntil = 0;
  npc.slowedUntil = 0;
  npc.targetX = npc.homeX;
  npc.targetZ = npc.homeZ;
  moveNpcToward(npc, npc.homeX, npc.homeZ, delta, getNpcMoveSpeed(npc));
  if (Math.hypot(npc.x - npc.homeX, npc.z - npc.homeZ) < 0.2) {
    npc.x = npc.homeX;
    npc.z = npc.homeZ;
    npc.aggroOriginX = npc.homeX;
    npc.aggroOriginZ = npc.homeZ;
    npc.isEvading = false;
    npc.animation = "idle";
  }
}

function startNpcAggro(npc: NpcState, sessionId: string) {
  npc.aggroTargetId = sessionId;
  npc.aggroOriginX = npc.x;
  npc.aggroOriginZ = npc.z;
  npc.isEvading = false;
  npc.nextDecisionAt = 0;
}

function findNearestAggroPlayer(npc: NpcState, players: MapSchema<PlayerState>) {
  let nearest: PlayerState | null = null;
  let nearestDistance = Infinity;
  players.forEach((player) => {
    if (player.health <= 0) return;
    const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
    if (distance > FARMER_COMBAT.aggroRange) return;
    if (distance < nearestDistance) {
      nearest = player;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function getFarmerLeashRange(npc: NpcState) {
  if (npc.id === RAID_OGRE_NPC_ID) return 82;
  if (npc.id === CENTRALIZER_NPC_ID) return 56;
  if (!npc.aggroTargetId) return FARMER_COMBAT.leashRange;
  return Math.max(FARMER_COMBAT.leashRange, PLAYER_ATTACK_PULL_LEASH_RANGE);
}

function getHogLeashRange(npc: NpcState) {
  if (!npc.aggroTargetId) return HOG_COMBAT.leashRange;
  return Math.max(HOG_COMBAT.leashRange, PLAYER_ATTACK_PULL_LEASH_RANGE);
}

function spreadAggroToNearbyHostiles(
  source: NpcState,
  npcs: MapSchema<NpcState>,
  players: MapSchema<PlayerState>,
) {
  if (!source.aggroTargetId || !isNpcAlive(source)) return;

  const target = players.get(source.aggroTargetId);
  if (!target || target.health <= 0) return;

  npcs.forEach((candidate) => {
    if (candidate.id === source.id || candidate.aggroTargetId) return;
    if (!isNpcAlive(candidate) || candidate.isImmortal) return;
    if (getNpcDisposition(candidate) !== "hostile") return;
    if (Math.hypot(candidate.x - source.x, candidate.z - source.z) > ENEMY_ASSIST_AGGRO_RANGE) return;

    startNpcAggro(candidate, source.aggroTargetId);
  });
}

function getPlayerSessionId(players: MapSchema<PlayerState>, target: PlayerState) {
  let found = "";
  players.forEach((player, sessionId) => {
    if (player === target) found = sessionId;
  });
  return found;
}

function findNearestPlayer(npc: NpcState, players: MapSchema<PlayerState>, maxDistance: number): PlayerState | null {
  let nearest: PlayerState | null = null;
  let nearestDistance = maxDistance;
  players.forEach((player) => {
    if (player.health <= 0) return;
    const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
    if (distance < nearestDistance) {
      nearest = player;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function moveNpcToward(npc: NpcState, x: number, z: number, delta: number, speed: number) {
  const dx = x - npc.x;
  const dz = z - npc.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.12) {
    npc.animation = "idle";
    return;
  }

  const step = Math.min(distance, getEffectiveNpcMoveSpeed(npc, speed) * delta);
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

function moveNpcAwayFrom(npc: NpcState, x: number, z: number, delta: number, speed: number) {
  const dx = npc.x - x;
  const dz = npc.z - z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.12) {
    npc.animation = "idle";
    return;
  }

  const step = getEffectiveNpcMoveSpeed(npc, speed) * delta;
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

function distanceToAggroOrigin(npc: NpcState, point: { x: number; z: number }) {
  return Math.hypot(point.x - npc.aggroOriginX, point.z - npc.aggroOriginZ);
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

function getEffectiveNpcMoveSpeed(npc: NpcState, speed: number) {
  return Date.now() < npc.slowedUntil ? speed * COMBAT.actions.iceBlast.slowMultiplier : speed;
}

function getNpcCollisionRadius(npc: NpcState) {
  if (npc.id === RAID_OGRE_NPC_ID) return 1.8;
  if (npc.id === CENTRALIZER_NPC_ID) return 1.05;
  if (npc.model === "rabbit") return 0.36;
  if (npc.model === "hog") return 0.74;
  if (npc.model === "deer") return 0.62;
  if (npc.model === "training-dummy") return 0.68;
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

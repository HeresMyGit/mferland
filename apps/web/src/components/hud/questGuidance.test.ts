import assert from "node:assert/strict";
import test from "node:test";
import { getActiveQuestGuidance, getPrimaryQuestGuidanceTarget } from "./questGuidance";
import { makeMferGptDailyQuestFlags, type NpcSnapshot, type PlayerSnapshot, type QuestSnapshot } from "@mferland/shared";

test("ready quests point at the turn-in NPC", () => {
  const guidance = getActiveQuestGuidance(
    makeQuest({ id: "mfer-beginnings", status: "ready" }),
    new Map([
      ["dao-mfer", makeNpc({ id: "dao-mfer", name: "oldhead mfer", x: 14.8, z: -8.8 })],
    ]),
    null,
  );

  assert.equal(guidance?.summary, "talk to oldhead mfer");
  assert.equal(guidance?.targets[0]?.npcId, "dao-mfer");
  assert.equal(guidance?.targets[0]?.kind, "turnIn");
});

test("named kill quests point at incomplete objective NPCs only", () => {
  const guidance = getActiveQuestGuidance(
    makeQuest({ id: "feral-farmers", flags: "farmhand-bran" }),
    new Map([
      ["farmhand-bran", makeNpc({ id: "farmhand-bran", name: "creyzie chaser bran", x: -77.5, z: 86.5, role: "farmer" })],
      ["farmhand-mae", makeNpc({ id: "farmhand-mae", name: "just-missed-it mae", x: -87.5, z: 91.5, role: "farmer" })],
      ["field-mage-sol", makeNpc({ id: "field-mage-sol", name: "nakamigo truther sol", x: -73.2, z: 99.8, role: "farmer" })],
    ]),
    null,
  );

  assert.deepEqual(guidance?.targets.map((target) => target.npcId), ["farmhand-mae", "field-mage-sol"]);
});

test("collection quests point at live source enemies nearest to the player", () => {
  const player = makePlayer({ x: -75, z: 90 });
  const guidance = getActiveQuestGuidance(
    makeQuest({ id: "hog-livers", progress: 2, required: 5 }),
    new Map([
      ["far-hog", makeNpc({ id: "far-hog", name: "far hog", model: "hog", role: "beast", x: -120, z: 130 })],
      ["near-hog", makeNpc({ id: "near-hog", name: "near hog", model: "hog", role: "beast", x: -76, z: 91 })],
      ["farmhand-bran", makeNpc({ id: "farmhand-bran", name: "creyzie chaser bran", role: "farmer", x: -77, z: 88 })],
    ]),
    player,
  );

  assert.equal(guidance?.targets.length, 2);
  assert.equal(getPrimaryQuestGuidanceTarget(guidance, player)?.npcId, "near-hog");
  assert.equal(guidance?.targets[0]?.kind, "collect");
});

test("mferGPT defeat dailies point at the selected mob group", () => {
  const guidance = getActiveQuestGuidance(
    makeQuest({
      id: "mfergpt-daily-signal",
      flags: makeMferGptDailyQuestFlags("claim-pile-hog-sweep"),
      required: 24,
    }),
    new Map([
      ["wild-hog-rooter", makeNpc({ id: "wild-hog-rooter", name: "claim pile hog", model: "hog", role: "beast", x: -81, z: 88 })],
      ["farmhand-bran", makeNpc({ id: "farmhand-bran", name: "creyzie chaser bran", role: "farmer", x: -77, z: 86 })],
    ]),
    null,
  );

  assert.equal(guidance?.summary, "clear 24 claim pile hogs around the busted farm");
  assert.deepEqual(guidance?.targets.map((target) => target.npcId), ["wild-hog-rooter"]);
  assert.equal(guidance?.targets[0]?.kind, "kill");
});

test("mferGPT collection dailies point at selected item sources", () => {
  const guidance = getActiveQuestGuidance(
    makeQuest({
      id: "mfergpt-daily-signal",
      flags: makeMferGptDailyQuestFlags("fried-uplink-haul"),
      required: 14,
    }),
    new Map([
      ["ridge-raider-vex", makeNpc({ id: "ridge-raider-vex", name: "operator vex", role: "farmer", x: 145, z: -84 })],
      ["wild-hog-rooter", makeNpc({ id: "wild-hog-rooter", name: "claim pile hog", model: "hog", role: "beast", x: -81, z: 88 })],
    ]),
    null,
  );

  assert.equal(guidance?.summary, "collect 14 fried uplink shards from Signal Ridge");
  assert.deepEqual(guidance?.targets.map((target) => target.npcId), ["ridge-raider-vex"]);
  assert.equal(guidance?.targets[0]?.kind, "collect");
});

function makeQuest(overrides: Partial<QuestSnapshot> & Pick<QuestSnapshot, "id">): QuestSnapshot {
  return {
    status: "active",
    progress: 0,
    required: 1,
    flags: "",
    completedAt: 0,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  const { appearanceTraits = {}, ...rest } = overrides;
  return {
    sessionId: "local",
    name: "tester",
    identityType: "guest",
    walletAddress: "",
    avatarSeed: 1,
    appearanceTraits,
    level: 1,
    xp: 0,
    talentPoints: 0,
    season0Points: 0,
    season0DailyPoints: 0,
    health: 100,
    maxHealth: 100,
    healthRegenPer5: 1,
    mana: 50,
    maxMana: 50,
    manaRegenPer5: 1,
    walkSpeed: 4,
    runSpeed: 7,
    strength: 1,
    dexterity: 1,
    magic: 1,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    animation: "idle",
    emote: "",
    emoteStartedAt: 0,
    emoteEndsAt: 0,
    lastSeq: 0,
    attackReadyAt: 0,
    shootReadyAt: 0,
    signalShotReadyAt: 0,
    fireblastReadyAt: 0,
    frostNovaReadyAt: 0,
    healReadyAt: 0,
    tauntReadyAt: 0,
    whirlwindReadyAt: 0,
    multishotReadyAt: 0,
    iceBlastReadyAt: 0,
    castingAction: "",
    castStartedAt: 0,
    castEndsAt: 0,
    lastCastAt: 0,
    lastDamagedAt: 0,
    frozenUntil: 0,
    quests: [],
    inventory: [],
    equipment: [],
    talents: [],
    ...rest,
  };
}

function makeNpc(overrides: Partial<NpcSnapshot> & Pick<NpcSnapshot, "id" | "name" | "x" | "z">): NpcSnapshot {
  return {
    role: "quest_giver",
    model: "mfer",
    portraitImage: "",
    avatarSeed: 1,
    health: 100,
    maxHealth: 100,
    isImmortal: false,
    y: 0,
    yaw: 0,
    animation: "idle",
    dialogue: "",
    questId: "",
    defeatedAt: 0,
    despawnAt: 0,
    frozenUntil: 0,
    slowedUntil: 0,
    aggroTargetId: "",
    hasLoot: false,
    ...overrides,
  };
}

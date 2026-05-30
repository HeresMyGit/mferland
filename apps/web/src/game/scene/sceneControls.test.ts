import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { PlayerSnapshot } from "@mferland/shared";
import { syncLocalVisualPlayerSnapshot, updateLocalVisualPlayer } from "./sceneControls";

test("syncLocalVisualPlayerSnapshot refreshes traits without snapping local movement", () => {
  const visual = makePlayer({
    appearanceTraits: { background: "blue", type: "plain" },
    x: 12,
    y: 0,
    z: 14,
    yaw: 1.2,
    animation: "run",
    season0Points: 2,
    season0DailyPoints: 1,
  });
  const authoritative = makePlayer({
    appearanceTraits: { background: "red", type: "alien", eyes: "vr" },
    x: 98,
    y: 3,
    z: 101,
    yaw: 2.6,
    animation: "idle",
    season0Points: 8,
    season0DailyPoints: 4,
  });

  syncLocalVisualPlayerSnapshot(visual, authoritative);

  assert.deepEqual(visual.appearanceTraits, authoritative.appearanceTraits);
  assert.equal(visual.season0Points, 8);
  assert.equal(visual.season0DailyPoints, 4);
  assert.equal(visual.x, 12);
  assert.equal(visual.y, 0);
  assert.equal(visual.z, 14);
  assert.equal(visual.yaw, 1.2);
  assert.equal(visual.animation, "run");
});

test("updateLocalVisualPlayer does not predict movement while frozen", () => {
  const visual = makePlayer({ x: 20, z: 20, animation: "idle" });
  const authoritative = makePlayer({ x: 20, z: 20, frozenUntil: Date.now() + 5000 });

  updateLocalVisualPlayer(visual, authoritative, new THREE.Vector3(1, 0, 0), 1, 0, true, true, 0.1);

  assert.equal(visual.x, 20);
  assert.equal(visual.z, 20);
  assert.equal(visual.animation, "idle");
});

function makePlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId: "session",
    name: "mfer",
    identityType: "wallet",
    isAgent: false,
    walletAddress: "0x0000000000000000000000000000000000000001",
    avatarSeed: 1,
    appearanceTraits: {},
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
    strength: 10,
    dexterity: 10,
    magic: 10,
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
    activeBuffs: [],
    ...overrides,
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { FISHING_POND_STATUS_NPC_ID, FISHING_TUTOR_NPC_ID, FISHING_VENDOR_NPC_ID, MINT_CLUB_REDEMPTION_NPC_ID } from "@mferland/shared";
import { generateMferTraitsForActor, traitsToMeshes } from "./mferTraits";

test("renders zombie eye base underneath glasses", () => {
  const meshes = traitsToMeshes({
    background: "graveyard",
    type: "zombie",
    eyes: "shades",
    mouth: "flat",
    headphones: "black",
  });

  assert.equal(meshes.has("eyes_zombie"), true);
  assert.equal(meshes.has("eyes_glasses"), true);
  assert.equal(meshes.has("eyes_glasses_shades"), true);
});

test("drip desk mfer does not inherit random hair", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const traits = generateMferTraitsForActor(seed, {
      id: "wearables-mfer",
      name: "drip desk mfer",
      role: "merchant",
    });

    assert.equal(traits.short_hair, undefined);
    assert.equal(traits.long_hair, undefined);
  }
});

test("oldhead cap does not inherit random mohawk", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const traits = generateMferTraitsForActor(seed, {
      id: "dao-mfer",
      name: "oldhead mfer",
      role: "quest_giver",
    });

    assert.equal(traits.hat_under_headphones, "cap_based_blue");
    assert.equal(traits.short_hair, undefined);
    assert.equal(traits.long_hair, undefined);
  }
});

test("fishing pond npcs have distinct outfits", () => {
  const motherfisher = generateMferTraitsForActor(123, {
    id: FISHING_TUTOR_NPC_ID,
    name: "Motherfisher",
    role: "merchant",
  });
  const fishMonger = generateMferTraitsForActor(123, {
    id: FISHING_VENDOR_NPC_ID,
    name: "fish monger",
    role: "merchant",
  });
  const onchainGoodies = generateMferTraitsForActor(123, {
    id: MINT_CLUB_REDEMPTION_NPC_ID,
    name: "onchain goodies mfer",
    role: "merchant",
  });
  const pondLedger = generateMferTraitsForActor(123, {
    id: FISHING_POND_STATUS_NPC_ID,
    name: "pond ledger mfer",
    role: "wanderer",
  });

  assert.equal(motherfisher.hat_over_headphones, "cowboy");
  assert.equal(motherfisher.eyes, "eyepatch");
  assert.equal(fishMonger.type, "ape");
  assert.equal(fishMonger.shirt, "hoodie_down_gray");
  assert.equal(onchainGoodies.type, "based");
  assert.equal(onchainGoodies.chain, "onchain");
  assert.equal(pondLedger.type, "plain");
  assert.equal(pondLedger.eyes, "nerd");
  assert.notDeepEqual(motherfisher, fishMonger);
  assert.notDeepEqual(motherfisher, onchainGoodies);
  assert.notDeepEqual(motherfisher, pondLedger);
  assert.notDeepEqual(fishMonger, onchainGoodies);
  assert.notDeepEqual(fishMonger, pondLedger);
  assert.notDeepEqual(onchainGoodies, pondLedger);
});

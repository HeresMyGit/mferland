import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MferlandAgentClient } from "./client.js";

const PLAYER_MENU_METHODS = [
  "leave",
  "selectTarget",
  "moveToPoint",
  "moveToNpc",
  "interactWithNpc",
  "acceptQuest",
  "completeQuest",
  "cancelQuest",
  "shareQuestLink",
  "chat",
  "emote",
  "sendAgentStatus",
  "useCombatAbility",
  "respawn",
  "lootNpc",
  "openStore",
  "equipItem",
  "unequipItem",
  "useItem",
  "selectTalent",
  "registerChainGear",
  "usePotionShopItem",
  "purchasePotionShopItem",
  "purchaseFishingSupply",
  "purchaseOnchainFishingRod",
  "respecTalents",
  "sellTrashItems",
  "startFishing",
  "reelFishing",
  "cancelFishing",
  "refreshFishingNftHistory",
  "submitFishingNftClaimTx",
  "abandonFishingNftCatch",
  "submitMintClubRedemptionTx",
  "sellFishingItems",
  "removeSeasonReferral",
  "updateTraits",
] as const;

const WEB_ROOM_SEND_METHODS: Record<string, readonly string[]> = {
  input: ["moveToPoint", "moveAlong", "moveToNpc"],
  chat: ["chat"],
  emote: ["emote"],
  agentStatus: ["sendAgentStatus"],
  interact: ["interactWithNpc", "openStore"],
  acceptQuest: ["acceptQuest"],
  completeQuest: ["completeQuest"],
  cancelQuest: ["cancelQuest"],
  shareQuestLink: ["shareQuestLink"],
  combatAction: ["useCombatAbility", "fightNpc"],
  respawn: ["respawn"],
  lootCorpse: ["lootNpc"],
  equipItem: ["equipItem"],
  unequipItem: ["unequipItem"],
  useItem: ["useItem"],
  registerChainGear: ["registerChainGear"],
  purchasePotionShopItem: ["usePotionShopItem", "purchasePotionShopItem"],
  purchaseFishingSupply: ["purchaseFishingSupply"],
  purchaseOnchainFishingRod: ["purchaseOnchainFishingRod"],
  respecTalents: ["respecTalents"],
  sellTrashItems: ["sellTrashItems"],
  startFishing: ["startFishing"],
  reelFishing: ["reelFishing"],
  cancelFishing: ["cancelFishing"],
  refreshFishingNftHistory: ["refreshFishingNftHistory"],
  submitFishingNftClaimTx: ["submitFishingNftClaimTx"],
  abandonFishingNftCatch: ["abandonFishingNftCatch"],
  submitMintClubRedemptionTx: ["submitMintClubRedemptionTx"],
  sellFishingItems: ["sellFishingItems"],
  removeSeasonReferral: ["removeSeasonReferral"],
  selectTalent: ["selectTalent"],
  updateTraits: ["updateTraits"],
};
const EXCLUDED_WEB_ROOM_SENDS = new Set([
  "analyticsEvent",
  "debugBeginPlacementSave",
  "debugBoostPlayer",
  "debugPlacementSaveChunk",
  "debugRegisterChainGear",
  "debugRequestPlacementMap",
  "debugSetNpcPlacement",
  "debugSetWorldPlacement",
  "debugSetupNpc",
  "debugTeleport",
  "debugUpdateChainGearTier",
]);

test("agent SDK exposes non-debug player menu controls", () => {
  const prototype = MferlandAgentClient.prototype as unknown as Record<string, unknown>;
  for (const method of PLAYER_MENU_METHODS) {
    assert.equal(typeof prototype[method], "function", `missing ${method}`);
  }
});

test("agent SDK covers non-debug room messages sent by the web menus", () => {
  const source = readFileSync(new URL("../../web/src/game/useTownRoom.ts", import.meta.url), "utf8");
  const messages = new Set([...source.matchAll(/\.send\("([^"]+)"/g)].map((match) => match[1]));
  const prototype = MferlandAgentClient.prototype as unknown as Record<string, unknown>;

  for (const message of [...messages].sort()) {
    if (EXCLUDED_WEB_ROOM_SENDS.has(message)) continue;
    const sdkMethods = WEB_ROOM_SEND_METHODS[message];
    assert.ok(sdkMethods, `web sends ${message}, but menuControls.test has no SDK mapping`);
    assert.ok(
      sdkMethods.some((method) => typeof prototype[method] === "function"),
      `web sends ${message}, but SDK methods are missing: ${sdkMethods.join(", ")}`,
    );
  }
});

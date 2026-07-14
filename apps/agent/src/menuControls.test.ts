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
  "prepareMintClubRedemption",
  "cancelMintClubRedemptionPreparation",
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
  prepareMintClubRedemption: ["prepareMintClubRedemption"],
  cancelMintClubRedemptionPreparation: ["cancelMintClubRedemptionPreparation"],
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

test("agent SDK sends fishing room messages and records sale results", async () => {
  const sent: Array<{ type: string; payload: unknown }> = [];
  const self = { sessionId: "self", fishingAttemptId: "" };
  const agent = new MferlandAgentClient({
    serverUrl: "http://127.0.0.1:8787",
    inviteCode: "",
    name: "fishing-test",
    account: {
      address: "0x0000000000000000000000000000000000000001",
      signMessage: async () => "0x",
    } as never,
    chatEnabled: false,
    log: () => undefined,
  });
  const runtimeAgent = agent as unknown as {
    room: {
      sessionId: string;
      send: (type: string, payload: unknown) => void;
    };
    players: Map<string, typeof self>;
    fishingResults: unknown[];
    fishingVendorResults: unknown[];
    waitFor: (predicate: () => boolean) => Promise<void>;
  };

  runtimeAgent.room = {
    sessionId: "self",
    send: (type, payload) => {
      sent.push({ type, payload });
      if (type === "startFishing") self.fishingAttemptId = "attempt-1";
      if (type === "reelFishing") {
        runtimeAgent.fishingResults.push({
          ok: true,
          attemptId: "attempt-1",
          outcome: "caught",
          itemId: "sartofish",
          itemName: "Sartofish",
          quantity: 1,
        });
      }
      if (type === "sellFishingItems") {
        runtimeAgent.fishingVendorResults.push({
          ok: true,
          status: "sold",
          sold: [{ itemId: "sartofish", itemName: "Sartofish", quantity: 2, points: 4, bundleSize: 2 }],
          quantity: 2,
          points: 4,
          season0Points: 4,
          season0DailyPoints: 4,
        });
      }
    },
  };
  runtimeAgent.players = new Map([["self", self]]);
  runtimeAgent.fishingResults = [];
  runtimeAgent.fishingVendorResults = [];
  runtimeAgent.waitFor = async (predicate) => {
    assert.equal(predicate(), true);
  };

  await agent.startFishing();
  await agent.reelFishing("attempt-1");
  await agent.sellFishingItems({ itemId: "sartofish" as never, quantity: 2 });

  assert.deepEqual(sent, [
    { type: "startFishing", payload: {} },
    { type: "reelFishing", payload: { attemptId: "attempt-1" } },
    { type: "sellFishingItems", payload: { itemId: "sartofish", quantity: 2 } },
  ]);
});

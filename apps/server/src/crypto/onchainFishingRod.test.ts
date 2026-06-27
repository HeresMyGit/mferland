import assert from "node:assert/strict";
import test from "node:test";
import {
  isOnchainFishingRodRequirementSatisfied,
  readOnchainFishingRodRequirement,
  readOnchainFishingRodWalletNft,
  resolveOnchainFishingRodConfig,
} from "./onchainFishingRod.js";

const ROD_ADDRESS = "0x1111111111111111111111111111111111111111";

test("resolves disabled onchain fishing rod config", async () => {
  const config = await resolveOnchainFishingRodConfig({
    MFERLAND_ONCHAIN_FISHING_ROD_ENABLED: "0",
  });

  assert.equal(config.enabled, false);
  assert.equal(config.required, false);
});

test("resolves ERC721 onchain fishing rod config from env", async () => {
  const config = await resolveOnchainFishingRodConfig({
    MFERLAND_ONCHAIN_FISHING_ROD_ENABLED: "1",
    MFERLAND_ONCHAIN_FISHING_ROD_CONTRACT_ADDRESS: ROD_ADDRESS,
    MFERLAND_ONCHAIN_FISHING_ROD_CHAIN_ID: "8453",
    MFERLAND_ONCHAIN_FISHING_ROD_RPC_URL: "https://mainnet.base.org",
    MFERLAND_ONCHAIN_FISHING_ROD_LABEL: "Onchain Pole",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_URL: "https://example.com/mint",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_MODE: "server",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_FUNCTION: "mint(address)",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_PAYMENT_TOKEN_ADDRESS: "0x2222222222222222222222222222222222222222",
    MFERLAND_ONCHAIN_FISHING_ROD_ADMIN_MINT_ENABLED: "true",
    MFERLAND_ONCHAIN_FISHING_ROD_ADMIN_MINT_PAYMENT_REQUIRED: "false",
    MFERLAND_ONCHAIN_FISHING_ROD_ADMIN_MINT_PRIVATE_KEY:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.required, true);
  assert.equal(config.contractAddress, ROD_ADDRESS);
  assert.equal(config.standard, "ERC721");
  assert.equal(config.tokenId, "");
  assert.equal(config.label, "Onchain Pole");
  assert.equal(config.mintUrl, "https://example.com/mint");
  assert.equal(config.mintMode, "server");
  assert.equal(config.mintContractAddress, ROD_ADDRESS);
  assert.equal(config.mintFunction, "mintTo");
  assert.equal(config.mintPaymentTokenAddress, "0x2222222222222222222222222222222222222222");
  assert.equal(config.mintPaymentSpenderAddress, ROD_ADDRESS);
  assert.equal(config.adminMintEnabled, true);
  assert.equal(config.adminMintPaymentRequired, false);
  assert.equal(config.adminMintPrivateKey, "0x1111111111111111111111111111111111111111111111111111111111111111");
  assert.equal(config.mintPriceAmountWei, "25000000000000000000000000");
  assert.equal(config.mintPriceLabel, "25M $MFERGPT");
});

test("resolves ERC1155 onchain fishing rod config and optional requirement", async () => {
  const config = await resolveOnchainFishingRodConfig({
    MFERLAND_ONCHAIN_FISHING_ROD_ENABLED: "true",
    MFERLAND_ONCHAIN_FISHING_ROD_REQUIRED: "false",
    MFERLAND_ONCHAIN_FISHING_ROD_CONTRACT_ADDRESS: ROD_ADDRESS,
    MFERLAND_ONCHAIN_FISHING_ROD_CHAIN_ID: "84532",
    MFERLAND_ONCHAIN_FISHING_ROD_RPC_URL: "https://sepolia.base.org",
    MFERLAND_ONCHAIN_FISHING_ROD_STANDARD: "ERC1155",
    MFERLAND_ONCHAIN_FISHING_ROD_TOKEN_ID: "7",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.required, false);
  assert.equal(config.standard, "ERC1155");
  assert.equal(config.tokenId, "7");
  assert.equal(config.mintMode, "wallet");
});

test("disabled rod requirement is satisfied without chain reads", async () => {
  const config = await resolveOnchainFishingRodConfig({
    MFERLAND_ONCHAIN_FISHING_ROD_ENABLED: "0",
  });

  const snapshot = await readOnchainFishingRodRequirement("", config);

  assert.equal(snapshot.enabled, false);
  assert.equal(snapshot.walletActionRequired, false);
  assert.equal(snapshot.adminMintEnabled, undefined);
  assert.equal(snapshot.mintPriceLabel, "25M $MFERGPT");
  assert.equal(isOnchainFishingRodRequirementSatisfied(snapshot), true);
});

test("disabled rod does not create a wallet NFT display row", async () => {
  const config = await resolveOnchainFishingRodConfig({
    MFERLAND_ONCHAIN_FISHING_ROD_ENABLED: "0",
  });

  assert.equal(await readOnchainFishingRodWalletNft("0x0a8138C495Cd47367E635B94FEB7612A230221a4", config), null);
});

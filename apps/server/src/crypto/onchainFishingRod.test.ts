import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_NATIVE_VALUE_WEI: "500000000000000",
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
  assert.equal(config.mintNativeValueWei, "500000000000000");
  assert.equal(config.mintPaymentTokenAddress, "0x2222222222222222222222222222222222222222");
  assert.equal(config.mintPaymentSpenderAddress, ROD_ADDRESS);
  assert.equal(config.adminMintEnabled, true);
  assert.equal(config.adminMintPaymentRequired, false);
  assert.equal(config.adminMintPrivateKey, "0x1111111111111111111111111111111111111111111111111111111111111111");
  assert.equal(config.mintPriceAmountWei, "25000000000000000000000000");
  assert.equal(config.mintPriceLabel, "25M $MFERGPT");
});

test("resolves Manifold claim mint config", async () => {
  const config = await resolveOnchainFishingRodConfig({
    MFERLAND_ONCHAIN_FISHING_ROD_ENABLED: "true",
    MFERLAND_ONCHAIN_FISHING_ROD_CONTRACT_ADDRESS: "0x7ad5e32fd403fd6fc696deca42d09b126502669a",
    MFERLAND_ONCHAIN_FISHING_ROD_CHAIN_ID: "8453",
    MFERLAND_ONCHAIN_FISHING_ROD_RPC_URL: "https://mainnet.base.org",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_URL: "https://manifold.xyz/@mfergpt/id/4029487344",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_MODE: "wallet",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_CONTRACT_ADDRESS: "0x23aa05a271debffaa3d75739af5581f744b326e4",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_FUNCTION: "manifoldClaim",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_INSTANCE_ID: "4029487344",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_PAYMENT_TOKEN_ADDRESS: "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_PRICE_AMOUNT_WEI: "25000000000000000000000000",
    MFERLAND_ONCHAIN_FISHING_ROD_MINT_PRICE_LABEL: "25M $MFERGPT",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.standard, "ERC721");
  assert.equal(config.mintMode, "wallet");
  assert.equal(config.mintContractAddress, "0x23aa05a271debffaa3d75739af5581f744b326e4");
  assert.equal(config.mintFunction, "manifoldClaim");
  assert.equal(config.mintInstanceId, "4029487344");
  assert.equal(config.mintIndex, 0);
  assert.deepEqual(config.mintMerkleProof, []);
  assert.equal(config.mintNativeValueWei, "");
  assert.equal(config.mintPaymentSpenderAddress, "0x23aa05a271debffaa3d75739af5581f744b326e4");
});

test("resolves live rod display config from production contracts document", async () => {
  const previousContractsFile = process.env.MFERLAND_CRYPTO_CONTRACTS_FILE;
  const dir = await mkdtemp(join(tmpdir(), "mferland-rod-config-"));
  const configPath = join(dir, "production-contracts.json");
  await writeFile(configPath, JSON.stringify({
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    addresses: {
      onchainFishingRod: "0x7ad5e32fd403fd6fc696deca42d09b126502669a",
    },
    onchainFishingRod: {
      enabled: true,
      required: true,
      standard: "ERC721",
      label: "onchain fishing rod",
      description: "wallet-held NFT required for onchain goodies at the pond",
      image: "https://assets.manifold.xyz/optimized/1c6fb1784b33e5b493964a76bab237c5938d3607345942eb2d44edfb439fa518/w_800.jpg",
      mintUrl: "https://manifold.xyz/@mfergpt/id/4029487344",
      mintMode: "wallet",
      mintContractAddress: "0x23aa05a271debffaa3d75739af5581f744b326e4",
      mintFunction: "manifoldClaim",
      mintInstanceId: "4029487344",
      mintPaymentTokenAddress: "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07",
      mintPaymentSpenderAddress: "0x23aa05a271debffaa3d75739af5581f744b326e4",
    },
  }));

  try {
    process.env.MFERLAND_CRYPTO_CONTRACTS_FILE = configPath;
    const config = await resolveOnchainFishingRodConfig({});

    assert.equal(config.enabled, true);
    assert.equal(config.required, true);
    assert.equal(config.chainId, 8453);
    assert.equal(config.rpcUrl, "https://mainnet.base.org");
    assert.equal(config.contractAddress, "0x7ad5e32fd403fd6fc696deca42d09b126502669a");
    assert.equal(config.standard, "ERC721");
    assert.equal(config.label, "onchain fishing rod");
    assert.equal(config.description, "wallet-held NFT required for onchain goodies at the pond");
    assert.equal(config.image, "https://assets.manifold.xyz/optimized/1c6fb1784b33e5b493964a76bab237c5938d3607345942eb2d44edfb439fa518/w_800.jpg");
    assert.equal(config.mintUrl, "https://manifold.xyz/@mfergpt/id/4029487344");
    assert.equal(config.mintMode, "wallet");
    assert.equal(config.mintContractAddress, "0x23aa05a271debffaa3d75739af5581f744b326e4");
    assert.equal(config.mintFunction, "manifoldClaim");
    assert.equal(config.mintInstanceId, "4029487344");
    assert.equal(config.mintIndex, 0);
    assert.deepEqual(config.mintMerkleProof, []);
    assert.equal(config.mintNativeValueWei, "");
    assert.equal(config.mintPaymentTokenAddress, "0x4160efdd66521483c22cb98b57b87d1fdafeab07");
    assert.equal(config.mintPaymentSpenderAddress, "0x23aa05a271debffaa3d75739af5581f744b326e4");
  } finally {
    if (previousContractsFile === undefined) {
      delete process.env.MFERLAND_CRYPTO_CONTRACTS_FILE;
    } else {
      process.env.MFERLAND_CRYPTO_CONTRACTS_FILE = previousContractsFile;
    }
    await rm(dir, { recursive: true, force: true });
  }
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

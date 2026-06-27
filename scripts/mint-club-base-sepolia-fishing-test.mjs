#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mintclub } from "mint.club-v2-sdk";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  maxUint256,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const repoRoot = resolve(import.meta.dirname, "..");
const defaultWalletFile = resolve(repoRoot, ".mferland-base-sepolia-test-wallet.json");
const defaultImagePath = resolve(repoRoot, "assets/mint-club-test/glass-spiral-cube.png");
const DEFAULT_IMAGE_URL = "https://picsum.photos/seed/mferland-glass-spiral-cube/1024/1024";

const CHAIN_ID = 84532;
const RPC_URL = process.env.MFERLAND_MINT_CLUB_TEST_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const MINT_CLUB_BOND_ADDRESS = "0x5dfA75b0185efBaEF286E80B847ce84ff8a62C2d";
const MINT_CLUB_ERC1155_ADDRESS = "0x4bF67e5C9baD43DD89dbe8fCAD3c213C868fe881";
const TOKEN_ID = 0n;
const MAX_SUPPLY = 25n;
const DEFAULT_TARGET_USD = 25;
const DEFAULT_TOTAL_MINT_OUT_WETH = "0.00625";
const DEFAULT_WRAP_ETH = "0.008";
const DEFAULT_POND_DEPOSIT_AMOUNT = 5n;

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const skipCreate = args.has("--skip-create");
const skipMint = args.has("--skip-mint");
const skipDeposit = args.has("--skip-deposit");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const walletFile = resolve(repoRoot, process.env.MFERLAND_MINT_CLUB_TEST_WALLET_FILE || defaultWalletFile);
  const privateKey = readPrivateKey(walletFile);
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) });
  mintclub.withPublicClient(publicClient).withWalletClient(walletClient);

  const symbol = normalizeSymbol(process.env.MINT_CLUB_TEST_SYMBOL || `GLS${new Date().toISOString().slice(5, 10).replace("-", "")}`);
  const name = process.env.MINT_CLUB_TEST_NAME || "Glass Spiral Cube";
  const nft = mintclub.network("basesepolia").nft(symbol);
  const tokenAddress = nft.getTokenAddress();

  const ethBalance = await publicClient.getBalance({ address: account.address });
  const wethBalance = await readErc20Balance(publicClient, WETH_ADDRESS, account.address);
  const pondAddress = normalizeOptionalAddress(process.env.MFERLAND_FISHING_POND_CONTRACT_ADDRESS || process.env.FISHING_POND_ADDRESS);
  const totalMintOut = await resolveTotalMintOutWeth();
  const totalMintOutWeth = totalMintOut.weth;
  const initialPrice = Number(totalMintOutWeth) / Number(MAX_SUPPLY) * 0.45;
  const finalPrice = Number(totalMintOutWeth) / Number(MAX_SUPPLY) * 1.55;
  const hostedMetadataUrl = await resolveMetadataUrl({ name, imagePath: defaultImagePath });
  const metadataUrl = hostedMetadataUrl || makeDataUriMetadataUrl({ name });

  console.log("Base Sepolia Mint Club Fishing Pond test");
  console.log(`mode: ${execute ? "execute" : "dry-run"}${execute ? "" : " (pass --execute to submit txs)"}`);
  console.log(`wallet: ${account.address}`);
  console.log(`ETH: ${formatEther(ethBalance)}`);
  console.log(`WETH: ${formatUnits(wethBalance, 18)}`);
  console.log(`symbol: ${symbol}`);
  console.log(`predicted collection: ${tokenAddress}`);
  console.log(`metadata: ${hostedMetadataUrl ? metadataUrl : "data URI fallback"}`);
  console.log(`target total mint-out: ${totalMintOutWeth} WETH across ${MAX_SUPPLY.toString()} NFTs`);
  console.log(`mint-out pricing source: ${totalMintOut.source}`);
  console.log(`linear price range: ${formatPrice(initialPrice)} -> ${formatPrice(finalPrice)} WETH`);
  console.log(`royalties: 3% mint, 3% sell/burn`);

  if (!execute) {
    printGameEnv({ tokenAddress, pondAddress });
    return;
  }

  const wrapAmount = parseEther(process.env.MINT_CLUB_TEST_WRAP_ETH || DEFAULT_WRAP_ETH);
  if (wrapAmount > 0n) {
    await ensureWrappedEth({ publicClient, walletClient, owner: account.address, minWeth: parseUnits(totalMintOutWeth, 18), wrapAmount });
  }

  if (!skipCreate) {
    await createMintClubErc1155({
      nft,
      name,
      metadataUrl,
      initialPrice,
      finalPrice,
    });
  }

  if (!skipMint) {
    await mintFullSupply({ nft, publicClient, owner: account.address });
  }

  if (pondAddress && !skipDeposit) {
    const depositAmount = BigInt(process.env.MINT_CLUB_TEST_POND_DEPOSIT_AMOUNT || DEFAULT_POND_DEPOSIT_AMOUNT.toString());
    await depositIntoPond({ publicClient, walletClient, owner: account.address, collection: tokenAddress, pondAddress, amount: depositAmount });
  } else if (!pondAddress) {
    console.log("Skipping pond deposit: set MFERLAND_FISHING_POND_CONTRACT_ADDRESS after deploying FishingPond on Base Sepolia.");
  }

  const finalBalance = await readErc1155Balance(publicClient, tokenAddress, account.address, TOKEN_ID);
  console.log(`wallet ERC-1155 balance after run: ${finalBalance.toString()}`);
  printGameEnv({ tokenAddress, pondAddress });
}

function readPrivateKey(walletFile) {
  if (!existsSync(walletFile)) {
    throw new Error(`Missing wallet file: ${walletFile}. Create/fund the disposable Base Sepolia wallet first.`);
  }
  const parsed = JSON.parse(readFileSync(walletFile, "utf8"));
  const privateKey = parsed.privateKey || parsed.PRIVATE_KEY;
  if (typeof privateKey !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`Wallet file ${walletFile} does not contain a valid privateKey.`);
  }
  return privateKey;
}

async function resolveMetadataUrl({ name, imagePath }) {
  if (process.env.MINT_CLUB_TEST_METADATA_URL) return process.env.MINT_CLUB_TEST_METADATA_URL;
  if (!process.env.FILEBASE_API_KEY) return null;
  const image = readFileSync(imagePath);
  const imageUri = await mintclub.ipfs.upload({
    filebaseApiKey: process.env.FILEBASE_API_KEY,
    media: new Blob([image], { type: "image/png" }),
  });
  return mintclub.ipfs.uploadMetadata({
    filebaseApiKey: process.env.FILEBASE_API_KEY,
    name,
    image: imageUri,
    description: "A Base Sepolia Mint Club ERC-1155 test prize for the mferland Fishing Pond redemption flow.",
    external_url: "https://game.mfergpt.lol",
    attributes: [
      { trait_type: "Test run", value: "Base Sepolia Fishing Pond" },
      { trait_type: "Reserve token", value: "WETH" },
      { trait_type: "Curve", value: "Linear" },
    ],
  });
}

function makeDataUriMetadataUrl({ name }) {
  const metadata = {
    name,
    description: "A Base Sepolia Mint Club ERC-1155 test prize for the mferland Fishing Pond redemption flow.",
    image: process.env.MINT_CLUB_TEST_IMAGE_URL || DEFAULT_IMAGE_URL,
    external_url: "https://game.mfergpt.lol",
    attributes: [
      { trait_type: "Test run", value: "Base Sepolia Fishing Pond" },
      { trait_type: "Reserve token", value: "WETH" },
      { trait_type: "Curve", value: "Linear" },
    ],
  };
  return `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
}

async function resolveTotalMintOutWeth() {
  if (process.env.MINT_CLUB_TEST_TOTAL_MINT_OUT_WETH) {
    return {
      weth: process.env.MINT_CLUB_TEST_TOTAL_MINT_OUT_WETH,
      source: "MINT_CLUB_TEST_TOTAL_MINT_OUT_WETH override",
    };
  }
  const targetUsd = Number(process.env.MINT_CLUB_TEST_TARGET_USD || DEFAULT_TARGET_USD);
  if (!Number.isFinite(targetUsd) || targetUsd <= 0) {
    throw new Error("MINT_CLUB_TEST_TARGET_USD must be a positive number.");
  }
  try {
    const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");
    if (!response.ok) throw new Error(`Coinbase quote HTTP ${response.status}`);
    const body = await response.json();
    const ethUsd = Number(body?.data?.amount);
    if (!Number.isFinite(ethUsd) || ethUsd <= 0) throw new Error("Coinbase quote did not include a valid ETH price");
    const weth = (targetUsd / ethUsd).toFixed(8);
    return {
      weth,
      source: `$${targetUsd.toFixed(2)} target / Coinbase ETH-USD spot $${ethUsd.toFixed(2)}`,
    };
  } catch (error) {
    return {
      weth: DEFAULT_TOTAL_MINT_OUT_WETH,
      source: `fallback ${DEFAULT_TOTAL_MINT_OUT_WETH} WETH; live ETH/USD quote failed (${error instanceof Error ? error.message : "unknown error"})`,
    };
  }
}

async function ensureWrappedEth({ publicClient, walletClient, owner, minWeth, wrapAmount }) {
  const wethBalance = await readErc20Balance(publicClient, WETH_ADDRESS, owner);
  if (wethBalance >= minWeth) {
    console.log(`WETH balance already covers mint target: ${formatUnits(wethBalance, 18)} WETH`);
    return;
  }
  const ethBalance = await publicClient.getBalance({ address: owner });
  if (ethBalance < wrapAmount) {
    throw new Error(`Need more Base Sepolia ETH to wrap ${formatEther(wrapAmount)} WETH. Current ETH: ${formatEther(ethBalance)}.`);
  }
  console.log(`Wrapping ${formatEther(wrapAmount)} ETH into WETH...`);
  const hash = await walletClient.writeContract({
    address: WETH_ADDRESS,
    abi: wethAbi,
    functionName: "deposit",
    args: [],
    value: wrapAmount,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`wrapped: https://sepolia.basescan.org/tx/${hash}`);
}

async function createMintClubErc1155({ nft, name, metadataUrl, initialPrice, finalPrice }) {
  console.log("Creating Mint Club ERC-1155...");
  const receipt = await nft.create({
    name,
    reserveToken: { address: WETH_ADDRESS, decimals: 18 },
    metadataUrl,
    buyRoyalty: 0.03,
    sellRoyalty: 0.03,
    curveData: {
      curveType: "LINEAR",
      stepCount: 25,
      maxSupply: Number(MAX_SUPPLY),
      initialMintingPrice: initialPrice,
      finalMintingPrice: finalPrice,
    },
    onSigned: (hash) => console.log(`create submitted: https://sepolia.basescan.org/tx/${hash}`),
  });
  if (!receipt || receipt.status !== "success") {
    throw new Error("Mint Club ERC-1155 create did not return a successful receipt.");
  }
  console.log(`created in block ${receipt.blockNumber?.toString?.() || "unknown"}`);
}

async function mintFullSupply({ nft, publicClient, owner }) {
  const tokenAddress = nft.getTokenAddress();
  const currentSupply = await readErc1155TotalSupply(publicClient, tokenAddress).catch(() => 0n);
  const remaining = MAX_SUPPLY - currentSupply;
  if (remaining <= 0n) {
    console.log("Mint Club ERC-1155 already minted out.");
    return;
  }
  console.log(`Minting ${remaining.toString()} ERC-1155 units...`);
  const receipt = await nft.buy({
    amount: remaining,
    slippage: 1,
    recipient: owner,
    onSigned: (hash) => console.log(`mint submitted: https://sepolia.basescan.org/tx/${hash}`),
  });
  if (!receipt || receipt.status !== "success") {
    throw new Error("Mint Club ERC-1155 mint did not return a successful receipt.");
  }
  console.log(`minted in block ${receipt.blockNumber?.toString?.() || "unknown"}`);
}

async function depositIntoPond({ publicClient, walletClient, owner, collection, pondAddress, amount }) {
  if (amount <= 0n) throw new Error("MINT_CLUB_TEST_POND_DEPOSIT_AMOUNT must be positive.");
  const balance = await readErc1155Balance(publicClient, collection, owner, TOKEN_ID);
  if (balance < amount) {
    throw new Error(`Wallet only owns ${balance.toString()} ERC-1155 units; cannot deposit ${amount.toString()}.`);
  }
  const approved = await publicClient.readContract({
    address: collection,
    abi: erc1155Abi,
    functionName: "isApprovedForAll",
    args: [owner, pondAddress],
  });
  if (!approved) {
    console.log("Approving FishingPond for ERC-1155 deposit...");
    const approveHash = await walletClient.writeContract({
      address: collection,
      abi: erc1155Abi,
      functionName: "setApprovalForAll",
      args: [pondAddress, true],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`pond approval: https://sepolia.basescan.org/tx/${approveHash}`);
  }
  console.log(`Depositing ${amount.toString()} ERC-1155 units into FishingPond...`);
  const hash = await walletClient.writeContract({
    address: pondAddress,
    abi: fishingPondAbi,
    functionName: "depositERC1155",
    args: [collection, TOKEN_ID, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`pond deposit: https://sepolia.basescan.org/tx/${hash}`);
}

async function readErc20Balance(publicClient, token, owner) {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

async function readErc1155Balance(publicClient, token, owner, tokenId) {
  return publicClient.readContract({
    address: token,
    abi: erc1155Abi,
    functionName: "balanceOf",
    args: [owner, tokenId],
  });
}

async function readErc1155TotalSupply(publicClient, token) {
  return publicClient.readContract({
    address: token,
    abi: erc1155Abi,
    functionName: "totalSupply",
    args: [],
  });
}

function printGameEnv({ tokenAddress, pondAddress }) {
  console.log("");
  console.log("Game/server env for this collection:");
  if (pondAddress) console.log(`MFERLAND_FISHING_POND_CONTRACT_ADDRESS=${pondAddress}`);
  console.log(`MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS=${tokenAddress}`);
  console.log("MFERLAND_MINT_CLUB_REDEMPTION_ENABLED=true");
  console.log(`MFERLAND_MINT_CLUB_REDEMPTION_ALLOWED_COLLECTIONS=${tokenAddress}`);
  console.log(`MFERLAND_MINT_CLUB_REDEMPTION_CHAIN_ID=${CHAIN_ID}`);
  console.log(`MFERLAND_MINT_CLUB_REDEMPTION_RESERVE_TOKEN_ADDRESS=${WETH_ADDRESS}`);
  console.log(`MFERLAND_MINT_CLUB_REDEMPTION_BOND_ADDRESS=${MINT_CLUB_BOND_ADDRESS}`);
  console.log(`MFERLAND_MINT_CLUB_REDEMPTION_ERC1155_ADDRESS=${MINT_CLUB_ERC1155_ADDRESS}`);
  console.log(`MFERLAND_MINT_CLUB_REDEMPTION_RPC_URL=${RPC_URL}`);
}

function normalizeSymbol(value) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!normalized) throw new Error("MINT_CLUB_TEST_SYMBOL must contain at least one alphanumeric character.");
  return normalized;
}

function normalizeOptionalAddress(value) {
  if (!value) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid address: ${value}`);
  return value;
}

function formatPrice(value) {
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

const wethAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
];

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const erc1155Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
];

const fishingPondAbi = [
  {
    type: "function",
    name: "depositERC1155",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collection", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "pondEntryId", type: "uint256" }],
  },
];

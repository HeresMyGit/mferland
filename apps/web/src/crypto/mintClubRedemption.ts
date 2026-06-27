import { type MintClubRedemptionSnapshot } from "@mferland/shared";
import { formatUnits } from "viem";
import { mintclub, type LowerCaseChainNames, type SdkSupportedChainIds } from "mint.club-v2-sdk";
import { waitForTransactionReceipt, type EthereumProvider } from "./transactionReceipts";

export type MintClubRedemptionWalletState = {
  ownedAmount: string;
  approvedForBond: boolean;
  reserveTokenMatches: boolean;
  sellEstimateWei: string;
  sellRoyaltyWei: string;
  sellEstimateLabel: string;
  sellRoyaltyLabel: string;
  minRefundWei: string;
  minRefundLabel: string;
  mintRoyaltyBps: number;
  sellRoyaltyBps: number;
  reserveBalanceWei: string;
};

export async function readMintClubRedemptionWalletState(
  walletAddress: string,
  redemption: MintClubRedemptionSnapshot,
): Promise<MintClubRedemptionWalletState> {
  const nft = mintclub.network(getMintClubNetworkId(redemption.chainId)).nft(redemption.collection);
  const [balance, bond, estimate, approvedForBond] = await Promise.all([
    nft.getBalanceOf(walletAddress as `0x${string}`),
    nft.getTokenBond(),
    nft.getSellEstimation(1n),
    nft.getIsApprovedForAll({
      owner: walletAddress as `0x${string}`,
      spender: redemption.bondAddress as `0x${string}`,
    }),
  ]);
  const [refundAmount = 0n, royaltyAmount = 0n] = Array.isArray(estimate)
    ? estimate as unknown as readonly bigint[]
    : [BigInt(estimate as unknown as bigint), 0n] as const;
  const sellRoyaltyBps = Number(bond.burnRoyalty ?? 0) * 100;
  const mintRoyaltyBps = Number(bond.mintRoyalty ?? 0) * 100;
  const minRefund = applySlippage(refundAmount, redemption.slippageBps);
  return {
    ownedAmount: balance.toString(),
    approvedForBond: Boolean(approvedForBond),
    reserveTokenMatches: bond.reserveToken.toLowerCase() === redemption.reserveTokenAddress.toLowerCase(),
    sellEstimateWei: refundAmount.toString(),
    sellRoyaltyWei: royaltyAmount.toString(),
    sellEstimateLabel: `${formatUnits(refundAmount, redemption.reserveTokenDecimals)} ${redemption.reserveTokenSymbol}`,
    sellRoyaltyLabel: `${formatUnits(royaltyAmount, redemption.reserveTokenDecimals)} ${redemption.reserveTokenSymbol}`,
    minRefundWei: minRefund.toString(),
    minRefundLabel: `${formatUnits(minRefund, redemption.reserveTokenDecimals)} ${redemption.reserveTokenSymbol}`,
    mintRoyaltyBps,
    sellRoyaltyBps,
    reserveBalanceWei: bond.reserveBalance.toString(),
  };
}

export async function approveMintClubRedemption(
  provider: EthereumProvider,
  walletAddress: string,
  redemption: MintClubRedemptionSnapshot,
) {
  await assertConnectedWallet(provider, walletAddress);
  mintclub.wallet.withAccount(walletAddress as `0x${string}`, provider);
  const nft = mintclub.network(getMintClubNetworkId(redemption.chainId)).nft(redemption.collection);
  const receipt = await nft.approve({
    spender: redemption.bondAddress as `0x${string}`,
    approved: true,
  });
  const txHash = receipt?.transactionHash;
  if (!txHash) throw new Error("approval transaction failed");
  return txHash;
}

export async function sellMintClubRedemption(
  provider: EthereumProvider,
  walletAddress: string,
  redemption: MintClubRedemptionSnapshot,
) {
  await assertConnectedWallet(provider, walletAddress);
  mintclub.wallet.withAccount(walletAddress as `0x${string}`, provider);
  const nft = mintclub.network(getMintClubNetworkId(redemption.chainId)).nft(redemption.collection);
  const receipt = await nft.sell({
    amount: 1n,
    slippage: redemption.slippageBps / 100,
    recipient: walletAddress as `0x${string}`,
  });
  const txHash = receipt?.transactionHash;
  if (!txHash) throw new Error("sell transaction failed");
  return txHash;
}

export function getMintClubRedemptionTxUrl(chainId: number, txHash: string) {
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  return "";
}

export async function waitForMintClubRedemptionReceipt(provider: EthereumProvider, txHash: string) {
  return waitForTransactionReceipt(provider, txHash, { maxAttempts: 90, intervalMs: 1000 });
}

async function assertConnectedWallet(provider: EthereumProvider, expectedWalletAddress: string) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (account.toLowerCase() !== expectedWalletAddress.trim().toLowerCase()) {
    throw new Error("connected wallet changed");
  }
}

function getMintClubNetworkId(chainId: number): SdkSupportedChainIds | LowerCaseChainNames {
  return chainId === 84532 ? "basesepolia" : chainId as never;
}

function applySlippage(amount: bigint, slippageBps: number) {
  const bps = BigInt(Math.max(0, Math.floor(slippageBps)));
  return amount - (amount * bps / 10_000n);
}

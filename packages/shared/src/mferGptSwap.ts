import { encodeAbiParameters, encodeFunctionData } from "viem";
import {
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BASE_CHAIN_ID_HEX,
  TRAIT_CHANGE_BASE_RPC_URL,
  TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
} from "./appearance.js";

export const MFERGPT_BASE_CHAIN_ID = TRAIT_CHANGE_BASE_CHAIN_ID;
export const MFERGPT_BASE_CHAIN_ID_HEX = TRAIT_CHANGE_BASE_CHAIN_ID_HEX;
export const MFERGPT_BASE_RPC_URL = TRAIT_CHANGE_BASE_RPC_URL;
export const MFERGPT_BASE_TOKEN_ADDRESS = TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS;
export const MFERGPT_BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
export const MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS = "0x6fF5693b99212Da76ad316178A184AB56D299b43";
export const MFERGPT_BASE_UNISWAP_V4_HOOKS_ADDRESS = "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC";
export const MFERGPT_DECIMALS = 18;
export const MFERGPT_SWAP_PRICE_DECIMALS = 18;
export const DEFAULT_MFERGPT_SWAP_ETH_AMOUNT = "0.01";
export const DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS = 500;
export const MFERGPT_SWAP_SLIPPAGE_DENOMINATOR_BPS = 10_000;
export const MFERGPT_SWAP_GAS_LIMIT = 900_000n;

const ACTION_CONSTANT_ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
const UNISWAP_COMMAND_WRAP_ETH = "0b";
const UNISWAP_COMMAND_V4_SWAP = "10";
const V4_ACTION_SWAP_EXACT_IN_SINGLE = "06";
const V4_ACTION_SETTLE = "0b";
const V4_ACTION_TAKE_ALL = "0f";

export const MFERGPT_UNIVERSAL_ROUTER_ABI = [{
  type: "function",
  name: "execute",
  stateMutability: "payable",
  inputs: [
    { name: "commands", type: "bytes" },
    { name: "inputs", type: "bytes[]" },
    { name: "deadline", type: "uint256" },
  ],
  outputs: [],
}] as const;

export const MFERGPT_BASE_UNISWAP_V4_POOL = {
  currency0: MFERGPT_BASE_TOKEN_ADDRESS,
  currency1: MFERGPT_BASE_WETH_ADDRESS,
  fee: 0x800000,
  tickSpacing: 200,
  hooks: MFERGPT_BASE_UNISWAP_V4_HOOKS_ADDRESS,
} as const;

export type MferGptSwapQuoteAmounts = {
  estimatedAmountOutWei: bigint;
  minAmountOutWei: bigint;
};

export function getMferGptSwapQuoteAmounts({
  amountInWei,
  priceNativeWei,
  slippageBps = DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS,
}: {
  amountInWei: bigint;
  priceNativeWei: bigint;
  slippageBps?: number | bigint;
}): MferGptSwapQuoteAmounts {
  if (amountInWei <= 0n) throw new Error("swap amount must be positive");
  if (priceNativeWei <= 0n) throw new Error("market price unavailable");
  const slippage = BigInt(slippageBps);
  if (slippage <= 0n || slippage >= BigInt(MFERGPT_SWAP_SLIPPAGE_DENOMINATOR_BPS)) {
    throw new Error("invalid swap slippage");
  }

  const estimatedAmountOutWei = amountInWei * 10n ** BigInt(MFERGPT_DECIMALS) / priceNativeWei;
  const minAmountOutWei = estimatedAmountOutWei
    * (BigInt(MFERGPT_SWAP_SLIPPAGE_DENOMINATOR_BPS) - slippage)
    / BigInt(MFERGPT_SWAP_SLIPPAGE_DENOMINATOR_BPS);
  if (minAmountOutWei <= 0n) throw new Error("swap amount too small");
  return { estimatedAmountOutWei, minAmountOutWei };
}

export function buildMferGptUniversalRouterCallData({
  amountInWei,
  minAmountOutWei,
  deadline,
}: {
  amountInWei: bigint;
  minAmountOutWei: bigint;
  deadline: bigint;
}) {
  const wrapEthInput = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [ACTION_CONSTANT_ADDRESS_THIS, amountInWei],
  );
  const swapActions = `0x${V4_ACTION_SWAP_EXACT_IN_SINGLE}${V4_ACTION_SETTLE}${V4_ACTION_TAKE_ALL}` as const;
  const swapParams = [
    encodeAbiParameters(
      [{
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      }],
      [{
        poolKey: MFERGPT_BASE_UNISWAP_V4_POOL,
        zeroForOne: false,
        amountIn: amountInWei,
        amountOutMinimum: minAmountOutWei,
        hookData: "0x",
      }],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bool" }],
      [MFERGPT_BASE_WETH_ADDRESS, amountInWei, false],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [MFERGPT_BASE_TOKEN_ADDRESS, minAmountOutWei],
    ),
  ];
  const v4SwapInput = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [swapActions, swapParams],
  );

  return encodeFunctionData({
    abi: MFERGPT_UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [
      `0x${UNISWAP_COMMAND_WRAP_ETH}${UNISWAP_COMMAND_V4_SWAP}`,
      [wrapEthInput, v4SwapInput],
      deadline,
    ],
  });
}

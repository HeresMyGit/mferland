import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData, parseEther, parseUnits } from "viem";
import {
  DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS,
  MFERGPT_BASE_TOKEN_ADDRESS,
  MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  MFERGPT_BASE_UNISWAP_V4_POOL,
  MFERGPT_BASE_WETH_ADDRESS,
  MFERGPT_UNIVERSAL_ROUTER_ABI,
  buildMferGptUniversalRouterCallData,
  getMferGptSwapQuoteAmounts,
} from "./mferGptSwap.js";

test("MFERGPT swap constants describe the Base Uniswap v4 route", () => {
  assert.equal(MFERGPT_BASE_TOKEN_ADDRESS, "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07");
  assert.equal(MFERGPT_BASE_WETH_ADDRESS, "0x4200000000000000000000000000000000000006");
  assert.equal(MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS, "0x6fF5693b99212Da76ad316178A184AB56D299b43");
  assert.equal(MFERGPT_BASE_UNISWAP_V4_POOL.currency0, MFERGPT_BASE_TOKEN_ADDRESS);
  assert.equal(MFERGPT_BASE_UNISWAP_V4_POOL.currency1, MFERGPT_BASE_WETH_ADDRESS);
  assert.equal(MFERGPT_BASE_UNISWAP_V4_POOL.hooks, "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC");
});

test("MFERGPT swap quote amounts apply slippage", () => {
  const amountInWei = parseEther("0.01");
  const priceNativeWei = parseUnits("0.000000001", 18);
  const quote = getMferGptSwapQuoteAmounts({ amountInWei, priceNativeWei });
  assert.equal(quote.estimatedAmountOutWei, parseUnits("10000000", 18));
  assert.equal(quote.minAmountOutWei, parseUnits(String(10_000_000 * (1 - DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS / 10_000)), 18));
});

test("MFERGPT swap calldata targets Universal Router execute", () => {
  const deadline = 1_800_000_000n;
  const data = buildMferGptUniversalRouterCallData({
    amountInWei: parseEther("0.01"),
    minAmountOutWei: parseUnits("9500000", 18),
    deadline,
  });
  const decoded = decodeFunctionData({ abi: MFERGPT_UNIVERSAL_ROUTER_ABI, data });
  assert.equal(decoded.functionName, "execute");
  assert.equal(decoded.args[0], "0x0b10");
  assert.equal(decoded.args[2], deadline);
});

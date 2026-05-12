import assert from "node:assert/strict";
import test from "node:test";
import { formatCompactTokenAmount, formatReadableDecimal } from "./displayAmounts";

test("formats large token amounts as approximate compact values", () => {
  assert.equal(formatCompactTokenAmount("23437500"), "~23m");
  assert.equal(formatCompactTokenAmount("26801.6676"), "~27k");
  assert.equal(formatCompactTokenAmount("9999999041.2345"), "~10b");
});

test("keeps unavailable token amounts unavailable", () => {
  assert.equal(formatCompactTokenAmount("--"), "--");
  assert.equal(formatCompactTokenAmount(""), "--");
});

test("rounds small token amounts without exposing decimal precision", () => {
  assert.equal(formatCompactTokenAmount("112.5"), "~113");
  assert.equal(formatCompactTokenAmount("0.004"), "~<0.01");
  assert.equal(formatCompactTokenAmount("0"), "0");
});

test("formats tiny quote decimals without scientific notation", () => {
  assert.equal(formatReadableDecimal("0.0000003053"), "0.0000003053");
  assert.equal(formatReadableDecimal("0.0000000003200"), "0.00000000032");
  assert.equal(formatReadableDecimal("0.0007856"), "0.0007856");
  assert.equal(formatReadableDecimal("217683.27"), "217,683.27");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getWalletClientKindMismatchMessage,
  normalizeWalletClientKind,
} from "./persistence.js";

test("wallet client kind mismatch messages name the registered kind", () => {
  assert.equal(getWalletClientKindMismatchMessage("human", "agent"), "wallet already registered for a human");
  assert.equal(getWalletClientKindMismatchMessage("agent", "human"), "wallet already registered for an agent");
  assert.equal(getWalletClientKindMismatchMessage("human", "human"), "");
  assert.equal(getWalletClientKindMismatchMessage("", "agent"), "");
});

test("wallet client kind normalization only accepts human and agent", () => {
  assert.equal(normalizeWalletClientKind("human"), "human");
  assert.equal(normalizeWalletClientKind("agent"), "agent");
  assert.equal(normalizeWalletClientKind("external"), "");
  assert.equal(normalizeWalletClientKind(undefined), "");
});

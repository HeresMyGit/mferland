import assert from "node:assert/strict";
import test from "node:test";
import {
  canEnterWalletCharacter,
  getWalletEntryLabel,
  isWalletProfilePending,
  type WalletProfileState,
} from "./walletProfile";

test("connected wallets wait for profile lookup before entering", () => {
  const idleProfile: WalletProfileState = { status: "idle" };

  assert.equal(isWalletProfilePending(true, idleProfile), true);
  assert.equal(getWalletEntryLabel({
    profilePending: true,
    needsCreation: false,
    hasExistingCharacter: false,
  }), "checking saved mfer");
  assert.equal(canEnterWalletCharacter({
    hasAddress: true,
    profilePending: true,
    profileError: false,
    inviteRequired: false,
    hasInviteCode: false,
    needsCreation: false,
    cleanName: "mfer",
  }), false);
});

test("existing wallet characters get an explicit continue action", () => {
  assert.equal(getWalletEntryLabel({
    profilePending: false,
    needsCreation: false,
    hasExistingCharacter: true,
  }), "continue saved mfer");
  assert.equal(canEnterWalletCharacter({
    hasAddress: true,
    profilePending: false,
    profileError: false,
    inviteRequired: false,
    hasInviteCode: false,
    needsCreation: false,
    cleanName: "",
  }), true);
});

test("new wallet characters require a name before creation", () => {
  assert.equal(getWalletEntryLabel({
    profilePending: false,
    needsCreation: true,
    hasExistingCharacter: false,
  }), "create verified mfer");
  assert.equal(canEnterWalletCharacter({
    hasAddress: true,
    profilePending: false,
    profileError: false,
    inviteRequired: false,
    hasInviteCode: false,
    needsCreation: true,
    cleanName: "",
  }), false);
  assert.equal(canEnterWalletCharacter({
    hasAddress: true,
    profilePending: false,
    profileError: false,
    inviteRequired: false,
    hasInviteCode: false,
    needsCreation: true,
    cleanName: "wallet mfer",
  }), true);
});

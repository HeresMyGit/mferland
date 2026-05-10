import assert from "node:assert/strict";
import test from "node:test";
import {
  canCreateWalletCharacterAfterProfileError,
  canEnterWalletCharacter,
  canRetryWalletProfile,
  getWalletEntryLabel,
  isWalletProfilePending,
  type WalletProfileState,
} from "./walletProfile";

test("connected wallets wait for profile lookup before entering", () => {
  const idleProfile: WalletProfileState = { status: "idle" };

  assert.equal(isWalletProfilePending(true, idleProfile), true);
  assert.equal(getWalletEntryLabel({
    profilePending: true,
    profileError: false,
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
    profileError: false,
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
    profileError: false,
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

test("wallet profile errors expose a retry action instead of an enter action", () => {
  assert.equal(getWalletEntryLabel({
    profilePending: false,
    profileError: true,
    needsCreation: false,
    hasExistingCharacter: false,
  }), "retry wallet check");
  assert.equal(canEnterWalletCharacter({
    hasAddress: true,
    profilePending: false,
    profileError: true,
    inviteRequired: false,
    hasInviteCode: false,
    needsCreation: false,
    cleanName: "mfer",
  }), false);
  assert.equal(canRetryWalletProfile({
    hasAddress: true,
    profilePending: false,
    profileError: true,
  }), true);
  assert.equal(canCreateWalletCharacterAfterProfileError({
    hasAddress: true,
    profilePending: false,
    profileError: true,
    inviteRequired: false,
    hasInviteCode: false,
    cleanName: "mfer",
  }), true);
});

test("wallet profile error creation fallback still requires a usable name and invite", () => {
  assert.equal(canCreateWalletCharacterAfterProfileError({
    hasAddress: true,
    profilePending: false,
    profileError: true,
    inviteRequired: false,
    hasInviteCode: false,
    cleanName: "",
  }), false);
  assert.equal(canCreateWalletCharacterAfterProfileError({
    hasAddress: true,
    profilePending: false,
    profileError: true,
    inviteRequired: true,
    hasInviteCode: false,
    cleanName: "mfer",
  }), false);
  assert.equal(canCreateWalletCharacterAfterProfileError({
    hasAddress: true,
    profilePending: false,
    profileError: true,
    inviteRequired: true,
    hasInviteCode: true,
    cleanName: "mfer",
  }), true);
});

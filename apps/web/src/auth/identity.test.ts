import assert from "node:assert/strict";
import test from "node:test";
import { getReferralWalletAddressFromSearch, makeReferralInviteUrl, makeWalletIdentity } from "./identity";

const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStorage.set(key, value),
  },
  configurable: true,
});

test("parses referral wallet URLs separately from invite codes", () => {
  assert.equal(
    getReferralWalletAddressFromSearch("?invite=early&referral=0x2222222222222222222222222222222222222222"),
    "0x2222222222222222222222222222222222222222",
  );
  assert.equal(getReferralWalletAddressFromSearch("?code=early"), "");
});

test("builds production referral invite URLs", () => {
  assert.equal(
    makeReferralInviteUrl("0x2222222222222222222222222222222222222222"),
    "https://game.mfergpt.lol/?referral=0x2222222222222222222222222222222222222222",
  );
  assert.equal(makeReferralInviteUrl("not-a-wallet"), "");
});

test("wallet character creation includes an explicit referral wallet override", () => {
  const identity = makeWalletIdentity(
    "referee",
    "0x1111111111111111111111111111111111111111",
    123,
    true,
    {
      nonce: "nonce",
      message: "message",
      signature: "0xsig",
    },
    "0x2222222222222222222222222222222222222222",
  );

  assert.equal(identity.referralWalletAddress, "0x2222222222222222222222222222222222222222");
});

test("wallet continuation does not send referral wallets", () => {
  const identity = makeWalletIdentity(
    "existing",
    "0x1111111111111111111111111111111111111111",
    123,
    false,
    undefined,
    "0x2222222222222222222222222222222222222222",
  );

  assert.equal(identity.referralWalletAddress, undefined);
});

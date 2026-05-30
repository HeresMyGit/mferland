import assert from "node:assert/strict";
import test from "node:test";
import { ErrorCode, ServerError } from "colyseus";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletAuthChallenge, verifyWalletAuthProof } from "./walletAuth.js";
import { TownRoom } from "./rooms/TownRoom.js";

test("wallet auth proof verifies a signed challenge once", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = createWalletAuthChallenge(account.address, "localhost:2567");
  assert.equal(challenge.ok, true);

  const signature = await account.signMessage({ message: challenge.message });
  const proof = {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  };

  assert.equal(await verifyWalletAuthProof(account.address, proof), true);
  assert.equal(await verifyWalletAuthProof(account.address, proof), false);
});

test("wallet auth proof rejects the wrong signer", async () => {
  const wallet = privateKeyToAccount(generatePrivateKey());
  const wrongWallet = privateKeyToAccount(generatePrivateKey());
  const challenge = createWalletAuthChallenge(wallet.address, "localhost:2567");
  assert.equal(challenge.ok, true);

  const signature = await wrongWallet.signMessage({ message: challenge.message });

  assert.equal(await verifyWalletAuthProof(wallet.address, {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  }), false);
});

test("TownRoom.onAuth requires wallet proof for wallet joins", async () => {
  const previousInviteGate = process.env.MFERLAND_ENABLE_INVITE_GATE;
  const previousRequireInvite = process.env.MFERLAND_REQUIRE_INVITE;
  const previousInviteCode = process.env.MFERLAND_INVITE_CODE;
  const previousLocalOnly = process.env.MFERLAND_LOCAL_ONLY;
  delete process.env.MFERLAND_ENABLE_INVITE_GATE;
  delete process.env.MFERLAND_REQUIRE_INVITE;
  delete process.env.MFERLAND_INVITE_CODE;
  delete process.env.MFERLAND_LOCAL_ONLY;

  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const room = new TownRoom();
    await assert.rejects(
      () => room.onAuth({} as never, {
        identityType: "wallet",
        walletAddress: account.address,
      }),
      (error: unknown) => error instanceof ServerError
        && error.code === ErrorCode.AUTH_FAILED
        && error.message === "wallet signature required",
    );

    const challenge = createWalletAuthChallenge(account.address, "localhost:2567");
    const signature = await account.signMessage({ message: challenge.message });
    assert.equal(await room.onAuth({} as never, {
      identityType: "wallet",
      walletAddress: account.address,
      walletAuth: {
        nonce: challenge.nonce,
        message: challenge.message,
        signature,
      },
    }), true);
  } finally {
    restoreEnv("MFERLAND_ENABLE_INVITE_GATE", previousInviteGate);
    restoreEnv("MFERLAND_REQUIRE_INVITE", previousRequireInvite);
    restoreEnv("MFERLAND_INVITE_CODE", previousInviteCode);
    restoreEnv("MFERLAND_LOCAL_ONLY", previousLocalOnly);
  }
});

test("TownRoom.onAuth requires declared agents to use wallet auth", async () => {
  const previousInviteGate = process.env.MFERLAND_ENABLE_INVITE_GATE;
  const previousRequireInvite = process.env.MFERLAND_REQUIRE_INVITE;
  const previousInviteCode = process.env.MFERLAND_INVITE_CODE;
  const previousLocalOnly = process.env.MFERLAND_LOCAL_ONLY;
  delete process.env.MFERLAND_ENABLE_INVITE_GATE;
  delete process.env.MFERLAND_REQUIRE_INVITE;
  delete process.env.MFERLAND_INVITE_CODE;
  delete process.env.MFERLAND_LOCAL_ONLY;

  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const room = new TownRoom();
    await assert.rejects(
      () => room.onAuth({} as never, {
        identityType: "agent",
        agentClient: true,
      }),
      (error: unknown) => error instanceof ServerError
        && error.code === ErrorCode.AUTH_FAILED
        && error.message === "agent wallet required",
    );

    const challenge = createWalletAuthChallenge(account.address, "localhost:2567");
    const signature = await account.signMessage({ message: challenge.message });
    assert.equal(await room.onAuth({} as never, {
      identityType: "wallet",
      walletAddress: account.address,
      agentClient: true,
      walletAuth: {
        nonce: challenge.nonce,
        message: challenge.message,
        signature,
      },
    }), true);
  } finally {
    restoreEnv("MFERLAND_ENABLE_INVITE_GATE", previousInviteGate);
    restoreEnv("MFERLAND_REQUIRE_INVITE", previousRequireInvite);
    restoreEnv("MFERLAND_INVITE_CODE", previousInviteCode);
    restoreEnv("MFERLAND_LOCAL_ONLY", previousLocalOnly);
  }
});

test("TownRoom.onAuth allows unsigned wallet joins for local-only development", async () => {
  const previousInviteGate = process.env.MFERLAND_ENABLE_INVITE_GATE;
  const previousRequireInvite = process.env.MFERLAND_REQUIRE_INVITE;
  const previousInviteCode = process.env.MFERLAND_INVITE_CODE;
  const previousLocalOnly = process.env.MFERLAND_LOCAL_ONLY;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.MFERLAND_ENABLE_INVITE_GATE;
  delete process.env.MFERLAND_REQUIRE_INVITE;
  delete process.env.MFERLAND_INVITE_CODE;
  process.env.MFERLAND_LOCAL_ONLY = "1";
  process.env.NODE_ENV = "development";

  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const room = new TownRoom();
    assert.equal(await room.onAuth({} as never, {
      identityType: "wallet",
      walletAddress: account.address,
    }), true);
  } finally {
    restoreEnv("MFERLAND_ENABLE_INVITE_GATE", previousInviteGate);
    restoreEnv("MFERLAND_REQUIRE_INVITE", previousRequireInvite);
    restoreEnv("MFERLAND_INVITE_CODE", previousInviteCode);
    restoreEnv("MFERLAND_LOCAL_ONLY", previousLocalOnly);
    restoreEnv("NODE_ENV", previousNodeEnv);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

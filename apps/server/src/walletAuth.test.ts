import assert from "node:assert/strict";
import test from "node:test";
import { ErrorCode, ServerError } from "colyseus";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createAgentSession,
  createWalletAuthChallenge,
  verifyAgentSessionToken,
  verifyAgentSessionTokenDetailed,
  verifyWalletAuthProof,
  verifyWalletAuthProofDetailed,
} from "./walletAuth.js";
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

test("wallet auth proof reports message mismatch without consuming the challenge", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = createWalletAuthChallenge(account.address, "localhost:2567");
  assert.equal(challenge.ok, true);

  const signature = await account.signMessage({ message: challenge.message });
  const mismatch = await verifyWalletAuthProofDetailed(account.address, {
    nonce: challenge.nonce,
    message: challenge.message.replaceAll("\n", "\\n"),
    signature,
  });

  assert.equal(mismatch.ok, false);
  if (mismatch.ok) assert.fail("expected message mismatch");
  assert.equal(mismatch.code, "message_mismatch");
  assert.equal(mismatch.recovery, "retry_with_exact_challenge_message");

  assert.equal(await verifyWalletAuthProof(account.address, {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  }), true);
});

test("agent session reports invalid signature without consuming the challenge", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const wrongWallet = privateKeyToAccount(generatePrivateKey());
  const challenge = createWalletAuthChallenge(account.address, "localhost:2567");
  assert.equal(challenge.ok, true);

  const wrongSignature = await wrongWallet.signMessage({ message: challenge.message });
  const failedSession = await createAgentSession(account.address, {
    nonce: challenge.nonce,
    message: challenge.message,
    signature: wrongSignature,
  });

  assert.equal(failedSession.ok, false);
  assert.equal(failedSession.code, "invalid_signature");
  assert.equal(failedSession.recovery, "retry_with_valid_signature");

  const signature = await account.signMessage({ message: challenge.message });
  const session = await createAgentSession(account.address, {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  });
  assert.equal(session.ok, true);
});

test("agent session verifies a signed challenge and reuses the minted token", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const wrongWallet = privateKeyToAccount(generatePrivateKey());
  const challenge = createWalletAuthChallenge(account.address, "localhost:2567");
  assert.equal(challenge.ok, true);

  const signature = await account.signMessage({ message: challenge.message });
  const proof = {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  };
  const session = await createAgentSession(account.address, proof);

  assert.equal(session.ok, true);
  assert.equal(session.walletAddress, account.address.toLowerCase());
  assert.match(session.sessionToken, /^[A-Za-z0-9_-]{43,}$/);
  assert.equal(verifyAgentSessionToken(account.address, session.sessionToken), true);
  assert.equal(verifyAgentSessionToken(account.address, session.sessionToken), true);
  assert.equal(verifyAgentSessionToken(wrongWallet.address, session.sessionToken), false);
  assert.equal(await verifyWalletAuthProof(account.address, proof), false);
});

test("agent session token verification reports actionable failures", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const wrongWallet = privateKeyToAccount(generatePrivateKey());
  const challenge = createWalletAuthChallenge(account.address, "localhost:2567");
  assert.equal(challenge.ok, true);

  const signature = await account.signMessage({ message: challenge.message });
  const session = await createAgentSession(account.address, {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  });
  assert.equal(session.ok, true);

  assert.deepEqual(verifyAgentSessionTokenDetailed(account.address, ""), {
    ok: false,
    code: "missing_session_token",
    recovery: "request_fresh_challenge",
  });
  assert.deepEqual(verifyAgentSessionTokenDetailed(account.address, "not a session token"), {
    ok: false,
    code: "malformed_session_token",
    recovery: "request_fresh_challenge",
  });
  assert.deepEqual(verifyAgentSessionTokenDetailed(wrongWallet.address, session.sessionToken), {
    ok: false,
    code: "agent_session_wallet_mismatch",
    recovery: "use_matching_session_token",
  });
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

test("TownRoom.onAuth accepts a wallet-bound agent session token", async () => {
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
    const challenge = createWalletAuthChallenge(account.address, "localhost:2567");
    const signature = await account.signMessage({ message: challenge.message });
    const session = await createAgentSession(account.address, {
      nonce: challenge.nonce,
      message: challenge.message,
      signature,
    });
    assert.equal(session.ok, true);

    const room = new TownRoom();
    assert.equal(await room.onAuth({} as never, {
      identityType: "wallet",
      walletAddress: account.address,
      agentClient: true,
      sessionToken: session.sessionToken,
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

test("TownRoom.onAuth blocks declared agents when disabled", async () => {
  const previousInviteGate = process.env.MFERLAND_ENABLE_INVITE_GATE;
  const previousRequireInvite = process.env.MFERLAND_REQUIRE_INVITE;
  const previousInviteCode = process.env.MFERLAND_INVITE_CODE;
  const previousLocalOnly = process.env.MFERLAND_LOCAL_ONLY;
  const previousAgentsEnabled = process.env.MFERLAND_AGENTS_ENABLED;
  delete process.env.MFERLAND_ENABLE_INVITE_GATE;
  delete process.env.MFERLAND_REQUIRE_INVITE;
  delete process.env.MFERLAND_INVITE_CODE;
  delete process.env.MFERLAND_LOCAL_ONLY;
  process.env.MFERLAND_AGENTS_ENABLED = "0";

  try {
    const humanAccount = privateKeyToAccount(generatePrivateKey());
    const humanChallenge = createWalletAuthChallenge(humanAccount.address, "localhost:2567");
    const humanSignature = await humanAccount.signMessage({ message: humanChallenge.message });
    const room = new TownRoom();
    assert.equal(await room.onAuth({} as never, {
      identityType: "wallet",
      walletAddress: humanAccount.address,
      walletAuth: {
        nonce: humanChallenge.nonce,
        message: humanChallenge.message,
        signature: humanSignature,
      },
    }), true);

    const agentAccount = privateKeyToAccount(generatePrivateKey());
    const agentChallenge = createWalletAuthChallenge(agentAccount.address, "localhost:2567");
    const agentSignature = await agentAccount.signMessage({ message: agentChallenge.message });
    await assert.rejects(
      () => room.onAuth({} as never, {
        identityType: "wallet",
        walletAddress: agentAccount.address,
        agentClient: true,
        walletAuth: {
          nonce: agentChallenge.nonce,
          message: agentChallenge.message,
          signature: agentSignature,
        },
      }),
      (error: unknown) => error instanceof ServerError
        && error.code === ErrorCode.AUTH_FAILED
        && error.message === "agent access disabled",
    );
  } finally {
    restoreEnv("MFERLAND_ENABLE_INVITE_GATE", previousInviteGate);
    restoreEnv("MFERLAND_REQUIRE_INVITE", previousRequireInvite);
    restoreEnv("MFERLAND_INVITE_CODE", previousInviteCode);
    restoreEnv("MFERLAND_LOCAL_ONLY", previousLocalOnly);
    restoreEnv("MFERLAND_AGENTS_ENABLED", previousAgentsEnabled);
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

test("TownRoom.onAuth allows configured local debug wallet joins in development", async () => {
  const previousInviteGate = process.env.MFERLAND_ENABLE_INVITE_GATE;
  const previousRequireInvite = process.env.MFERLAND_REQUIRE_INVITE;
  const previousInviteCode = process.env.MFERLAND_INVITE_CODE;
  const previousLocalOnly = process.env.MFERLAND_LOCAL_ONLY;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLocalDebugBypass = process.env.MFERLAND_LOCAL_DEBUG_AUTH_BYPASS;
  const previousLocalDebugWallet = process.env.MFERLAND_LOCAL_DEBUG_WALLET_ADDRESS;
  const previousLocalDebugWallets = process.env.MFERLAND_LOCAL_DEBUG_WALLET_ADDRESSES;
  delete process.env.MFERLAND_ENABLE_INVITE_GATE;
  delete process.env.MFERLAND_REQUIRE_INVITE;
  delete process.env.MFERLAND_INVITE_CODE;
  delete process.env.MFERLAND_LOCAL_ONLY;
  delete process.env.MFERLAND_LOCAL_DEBUG_WALLET_ADDRESS;
  process.env.NODE_ENV = "development";
  process.env.MFERLAND_LOCAL_DEBUG_AUTH_BYPASS = "1";

  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const otherAccount = privateKeyToAccount(generatePrivateKey());
    process.env.MFERLAND_LOCAL_DEBUG_WALLET_ADDRESSES = account.address;
    const room = new TownRoom();
    assert.equal(await room.onAuth({} as never, {
      identityType: "wallet",
      walletAddress: account.address,
    }), true);
    await assert.rejects(
      () => room.onAuth({} as never, {
        identityType: "wallet",
        walletAddress: otherAccount.address,
      }),
      (error: unknown) => error instanceof ServerError
        && error.code === ErrorCode.AUTH_FAILED
        && error.message === "wallet signature required",
    );
  } finally {
    restoreEnv("MFERLAND_ENABLE_INVITE_GATE", previousInviteGate);
    restoreEnv("MFERLAND_REQUIRE_INVITE", previousRequireInvite);
    restoreEnv("MFERLAND_INVITE_CODE", previousInviteCode);
    restoreEnv("MFERLAND_LOCAL_ONLY", previousLocalOnly);
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("MFERLAND_LOCAL_DEBUG_AUTH_BYPASS", previousLocalDebugBypass);
    restoreEnv("MFERLAND_LOCAL_DEBUG_WALLET_ADDRESS", previousLocalDebugWallet);
    restoreEnv("MFERLAND_LOCAL_DEBUG_WALLET_ADDRESSES", previousLocalDebugWallets);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

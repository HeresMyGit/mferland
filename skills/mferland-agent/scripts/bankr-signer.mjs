#!/usr/bin/env node

import { readFileSync } from "node:fs";

const apiKey = (process.env.BANKR_API_KEY || "").trim();
if (!apiKey) fail("BANKR_API_KEY is required in the runtime environment.");

const input = readStdin().trim();
if (!input) fail("Expected JSON request on stdin.");

let request;
try {
  request = JSON.parse(input);
} catch (error) {
  fail(`Invalid JSON request: ${error instanceof Error ? error.message : String(error)}`);
}

const action = String(request.action || "");
if (action === "signMessage") {
  const message = String(request.message || "");
  if (!message) fail("signMessage request is missing message.");
  const body = await postJson("https://api.bankr.bot/wallet/sign", {
    signatureType: "personal_sign",
    message,
  });
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) fail(`Bankr sign response missing signature: ${JSON.stringify(body)}`);
  process.stdout.write(`${JSON.stringify({ signature })}\n`);
  process.exit(0);
}

if (action === "sendTransaction") {
  const transaction = {
    to: request.to,
    chainId: request.chainId,
    data: request.data || undefined,
    value: request.valueWei || "0",
    gas: request.gas || undefined,
  };
  if (typeof transaction.to !== "string" || !transaction.to) fail("sendTransaction request is missing to.");
  if (typeof transaction.chainId !== "number") fail("sendTransaction request is missing numeric chainId.");
  const body = await postJson("https://api.bankr.bot/wallet/submit", {
    transaction,
    description: typeof request.label === "string" ? request.label : "mferland agent transaction",
    waitForConfirmation: true,
  });
  const txHash =
    typeof body.transactionHash === "string"
      ? body.transactionHash
      : typeof body.txHash === "string"
        ? body.txHash
        : "";
  if (!/^0x[0-9a-fA-F]+$/.test(txHash)) fail(`Bankr submit response missing tx hash: ${JSON.stringify(body)}`);
  process.stdout.write(`${JSON.stringify({ txHash })}\n`);
  process.exit(0);
}

fail(`Unsupported action: ${action || "(empty)"}`);

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) fail(`Bankr API ${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  return body;
}

function readStdin() {
  return readFileSync(0, "utf8");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

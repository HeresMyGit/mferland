import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

console.error([
  "mferland-agent wallet:create is an optional disposable-wallet helper.",
  "For production, use an agent-controlled wallet/signer you already own or manage.",
  "That can be a private key, Bankr/MPC signer, custody API, local wallet, or another signing backend.",
  "The only protocol requirement is that the agent can sign the /wallet-auth-challenge message for its wallet address.",
  "Do not fund a generated disposable wallet with meaningful value unless you securely store and manage the key.",
].join("\n"));

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log(JSON.stringify({
  address: account.address,
  privateKey,
}, null, 2));

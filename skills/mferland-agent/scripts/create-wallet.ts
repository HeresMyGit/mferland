import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log(JSON.stringify({
  address: account.address,
  privateKey,
}, null, 2));

import { resolve } from "node:path";
import { exportLocalContractAddresses } from "./export-local-addresses-core.mjs";

const chainId = 31337;
const broadcastPath = resolve("broadcast/DeployLocalSuite.s.sol", String(chainId), "run-latest.json");
const outputPath = resolve("../../apps/web/public/crypto/local-contracts.json");

await exportLocalContractAddresses({
  chainId,
  broadcastPath,
  outputPath,
});
console.log(`Exported local contract addresses to ${outputPath}`);

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { auditDeployment, codeHash, parseDeploymentRecord } from "../src/audit.ts";

const contracts = resolve(new URL("../../contracts", import.meta.url).pathname);
const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/audit.ts <deployment-file.json> [--roots]");
  process.exit(1);
}

const record = parseDeploymentRecord(JSON.parse(readFileSync(resolve(file), "utf8")));
const artifact = JSON.parse(
  readFileSync(`${contracts}/out/ComplianceVerifier.sol/ComplianceVerifier.json`, "utf8"),
);
const client = createPublicClient({ transport: http(record.rpcUrl) });

const checks = await auditDeployment(client, record.deployment, {
  ...record,
  verifierCodeHash: codeHash(artifact.deployedBytecode.object),
  rootsPublished: flags.includes("--roots"),
});

for (const { name, ok, detail } of checks)
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
process.exit(checks.every((check) => check.ok) ? 0 : 1);

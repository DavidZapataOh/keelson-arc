import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { writeFixtures } from "./fixtures.ts";
import { productionKeys } from "./keys.ts";
import { renderVerifier } from "./verifier.ts";

const contracts = resolve(new URL("../../contracts", import.meta.url).pathname);

const keys = await productionKeys();
console.log(`generating from the ${keys.source} keys`);

const verifier = resolve(contracts, "src/verifiers/ComplianceVerifier.sol");
mkdirSync(dirname(verifier), { recursive: true });
writeFileSync(
  verifier,
  renderVerifier("ComplianceVerifier", JSON.parse(readFileSync(keys.vkey, "utf8"))),
);
await writeFixtures(keys, resolve(contracts, "test/fixtures/compliance.json"));
process.exit(0);

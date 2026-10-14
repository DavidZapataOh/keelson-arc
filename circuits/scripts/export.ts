import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildCircuit } from "./build.ts";
import { writeFixtures } from "./fixtures.ts";
import { renderVerifier } from "./verifier.ts";

const contracts = resolve(new URL("../../contracts", import.meta.url).pathname);

const built = await buildCircuit(
  "compliance",
  new URL("../main/compliance.circom", import.meta.url).pathname,
);

const verifier = resolve(contracts, "src/verifiers/ComplianceVerifier.sol");
mkdirSync(dirname(verifier), { recursive: true });
writeFileSync(
  verifier,
  renderVerifier("ComplianceVerifier", JSON.parse(readFileSync(built.vkey, "utf8"))),
);
await writeFixtures(built, resolve(contracts, "test/fixtures/compliance.json"));
process.exit(0);

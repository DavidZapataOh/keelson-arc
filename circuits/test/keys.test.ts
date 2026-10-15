import { readFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import { describe, expect, it } from "vitest";
import { verifyCeremony } from "../scripts/ceremony.ts";
import { COMPLIANCE_SOURCE, productionKeys } from "../scripts/keys.ts";
import { renderVerifier } from "../scripts/verifier.ts";

const contracts = new URL("../../contracts/", import.meta.url);
const read = (path: string, base = contracts) => readFileSync(new URL(path, base), "utf8");

describe("the keys the system runs with", () => {
  it("are the keys the committed verifier and contract fixtures were generated from", async () => {
    const keys = await productionKeys();
    const vkey = JSON.parse(readFileSync(keys.vkey, "utf8"));

    expect(read("src/verifiers/ComplianceVerifier.sol")).toBe(
      renderVerifier("ComplianceVerifier", vkey),
    );

    const fixtures = JSON.parse(read("test/fixtures/compliance.json"));
    for (const { a, b, c, signals } of Object.values(fixtures.proofs) as {
      a: string[];
      b: string[][];
      c: string[];
      signals: string[];
    }[]) {
      const proof = {
        pi_a: [...a, "1"],
        pi_b: [[...(b[0] as string[])].reverse(), [...(b[1] as string[])].reverse(), ["1", "0"]],
        pi_c: [...c, "1"],
        protocol: "groth16",
        curve: "bn128",
      };
      expect(await snarkjs.groth16.verify(vkey, signals, proof)).toBe(true);
    }
  }, 240_000);

  it("come from a verified ceremony once one is published", async () => {
    const keys = await productionKeys();
    if (keys.source === "ceremony") {
      await verifyCeremony({ name: "compliance", source: COMPLIANCE_SOURCE });
    } else {
      expect(keys.source).toBe("development");
    }
  }, 600_000);
});

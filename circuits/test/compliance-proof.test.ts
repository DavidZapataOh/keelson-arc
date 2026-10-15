import { readFileSync } from "node:fs";
import { complianceInput, decryptSubject, nullifierOf, subjectOf } from "@keelson/sdk";
import * as snarkjs from "snarkjs";
import { beforeAll, describe, expect, it } from "vitest";
import { type BuildResult, buildCircuit } from "../scripts/build.ts";
import { credential, regulatorSecret, request } from "./compliance.fixtures.ts";

const source = new URL("./fixtures/compliance.circom", import.meta.url).pathname;
let built: BuildResult;

beforeAll(async () => {
  built = await buildCircuit("compliance", source, "compliance-fixture");
}, 600_000);

const vkey = () => JSON.parse(readFileSync(built.vkey, "utf8"));
const prove = () => snarkjs.groth16.fullProve(complianceInput(request), built.wasm, built.zkey);

describe("compliance proof", () => {
  it("verifies and exposes the public signals in a fixed order", async () => {
    const { proof, publicSignals } = await prove();
    const [nullifier, c1x, c1y, c2, ...inputs] = publicSignals.map(BigInt) as bigint[];
    expect(nullifier).toBe(nullifierOf(credential.secret, request.tradeId));
    expect(inputs).toEqual([
      request.tradeId,
      request.tradingAddress,
      request.issuers.root,
      request.sanctions.root,
      request.revocations.root,
      request.minTier,
      request.validAt,
      request.regulatorKey.x,
      request.regulatorKey.y,
    ]);
    expect(publicSignals).toHaveLength(13);
    expect(decryptSubject({ c1x, c1y, c2 } as never, regulatorSecret)).toBe(
      subjectOf(credential.secret),
    );
    expect(await snarkjs.groth16.verify(vkey(), publicSignals, proof)).toBe(true);
  }, 120_000);

  it("fails verification when any public signal is altered", async () => {
    const { proof, publicSignals } = await prove();
    for (let index = 0; index < publicSignals.length; index++) {
      const tampered = [...publicSignals];
      tampered[index] = (BigInt(tampered[index] as string) + 1n).toString();
      expect(await snarkjs.groth16.verify(vkey(), tampered, proof)).toBe(false);
    }
  }, 120_000);
});

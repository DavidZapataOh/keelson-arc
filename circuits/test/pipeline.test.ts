import { readFileSync } from "node:fs";
import { MerkleTree } from "@keelson/sdk";
import * as snarkjs from "snarkjs";
import { beforeAll, describe, expect, it } from "vitest";
import { type BuildResult, buildCircuit } from "../scripts/build.ts";

const source = new URL("./fixtures/merkle.circom", import.meta.url).pathname;
const tree = new MerkleTree(4, [101n, 202n, 303n]);
let built: BuildResult;

beforeAll(async () => {
  built = await buildCircuit("merkle", source);
}, 240_000);

const prove = () =>
  snarkjs.groth16.fullProve({ leaf: 202n, ...tree.prove(1) }, built.wasm, built.zkey);
const vkey = () => JSON.parse(readFileSync(built.vkey, "utf8"));

describe("build pipeline", () => {
  it("produces a proof that verifies", async () => {
    const { proof, publicSignals } = await prove();
    expect(publicSignals).toEqual([tree.root.toString(), "202"]);
    expect(await snarkjs.groth16.verify(vkey(), publicSignals, proof)).toBe(true);
  });

  it("rejects a proof presented with a different public input", async () => {
    const { proof, publicSignals } = await prove();
    for (const index of [0, 1]) {
      const tampered = [...publicSignals];
      tampered[index] = "12345";
      expect(await snarkjs.groth16.verify(vkey(), tampered, proof)).toBe(false);
    }
  });

  it("builds identical verification keys every time", async () => {
    const first = readFileSync(built.vkey, "utf8");
    const again = await buildCircuit("merkle", source);
    expect(readFileSync(again.vkey, "utf8")).toBe(first);
  }, 240_000);
});

import { MerkleTree } from "@keelson/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { compileFixture } from "./support.ts";

const leaves = [101n, 202n, 303n, 404n, 505n];
const tree = new MerkleTree(4, leaves);
let circuit: Awaited<ReturnType<typeof compileFixture>>;

const input = (index: number, leaf: bigint) => ({ leaf, ...tree.prove(index) });

describe("MerkleRoot", () => {
  beforeAll(async () => {
    circuit = await compileFixture("merkle");
  });

  it("recomputes the root for every leaf", async () => {
    for (const [index, leaf] of leaves.entries()) {
      const witness = await circuit.calculateWitness(input(index, leaf), true);
      await circuit.checkConstraints(witness);
      expect(witness[1]).toBe(tree.root);
    }
  });

  it("produces a different root for a different leaf", async () => {
    const witness = await circuit.calculateWitness(input(0, 102n), true);
    expect(witness[1]).not.toBe(tree.root);
  });

  it("rejects a path bit that is not boolean", async () => {
    const bad = { ...input(0, 101n), pathBits: [2, 0, 0, 0] };
    await expect(circuit.calculateWitness(bad, true)).rejects.toThrow();
  });
});

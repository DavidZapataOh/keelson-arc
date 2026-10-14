import { describe, expect, it } from "vitest";
import { MerkleTree } from "../src/merkle.ts";
import { hash } from "../src/poseidon.ts";

const leaves = [11n, 22n, 33n];

const climb = (leaf: bigint, siblings: bigint[], pathBits: number[]) =>
  siblings.reduce(
    (node, sibling, level) => (pathBits[level] ? hash([sibling, node]) : hash([node, sibling])),
    leaf,
  );

describe("MerkleTree", () => {
  const tree = new MerkleTree(3, leaves);

  it("proves every leaf against the root", () => {
    leaves.forEach((leaf, index) => {
      const { siblings, pathBits } = tree.prove(index);
      expect(climb(leaf, siblings, pathBits)).toBe(tree.root);
    });
  });

  it("changes the root when a leaf changes", () => {
    expect(new MerkleTree(3, [11n, 22n, 34n]).root).not.toBe(tree.root);
  });

  it("has a stable empty root", () => {
    expect(new MerkleTree(3, []).root).toBe(new MerkleTree(3, []).root);
  });

  it("rejects overfull trees and bad indexes", () => {
    expect(() => new MerkleTree(1, [1n, 2n, 3n])).toThrow("full");
    expect(() => tree.prove(3)).toThrow("out of range");
  });
});

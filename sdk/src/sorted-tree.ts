import { type MerklePath, MerkleTree } from "./merkle.ts";
import { hash } from "./poseidon.ts";

export const VALUE_BITS = 248n;
export const MAX_VALUE = (1n << VALUE_BITS) - 1n;

export type NonMembershipWitness = MerklePath & { low: bigint; next: bigint };

type Leaf = { low: bigint; next: bigint };

/**
 * Sorted Merkle set. Each leaf links a value to its successor, so absence of
 * `x` is shown by one leaf with `low < x < next`. The first leaf starts at 0
 * and the last one ends at MAX_VALUE.
 */
export class SortedTree {
  readonly depth: number;
  readonly root: bigint;
  private readonly leaves: Leaf[];
  private readonly tree: MerkleTree;
  private readonly members: Set<bigint>;

  constructor(depth: number, values: bigint[]) {
    this.depth = depth;
    const sorted = [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (sorted.some((value) => value <= 0n || value >= MAX_VALUE)) {
      throw new Error("values must be in (0, 2^248 - 1)");
    }
    const chain = [0n, ...sorted];
    this.members = new Set(sorted);
    this.leaves = chain.map((low, i) => ({ low, next: chain[i + 1] ?? MAX_VALUE }));
    this.tree = new MerkleTree(
      depth,
      this.leaves.map((leaf) => hash([leaf.low, leaf.next])),
    );
    this.root = this.tree.root;
  }

  contains(value: bigint): boolean {
    return this.members.has(value);
  }

  prove(value: bigint): NonMembershipWitness {
    const index = this.leaves.findIndex((leaf) => leaf.low < value && value < leaf.next);
    const leaf = this.leaves[index];
    if (!leaf) throw new Error("value is a member of the set or out of range");
    return { low: leaf.low, next: leaf.next, ...this.tree.prove(index) };
  }
}

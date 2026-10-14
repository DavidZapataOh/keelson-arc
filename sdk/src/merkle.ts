import { hash } from "./poseidon.ts";

export type MerklePath = { siblings: bigint[]; pathBits: number[] };

const zeroHashes = (depth: number): bigint[] => {
  const zeros = [0n];
  for (let level = 0; level < depth; level++) {
    const zero = zeros[level] as bigint;
    zeros.push(hash([zero, zero]));
  }
  return zeros;
};

export class MerkleTree {
  readonly depth: number;
  readonly root: bigint;
  private readonly levels: bigint[][];
  private readonly zeros: bigint[];

  constructor(depth: number, leaves: bigint[]) {
    if (leaves.length > 2 ** depth) throw new Error("tree is full");
    this.depth = depth;
    this.zeros = zeroHashes(depth);
    this.levels = [leaves];
    for (let level = 0; level < depth; level++) {
      const row = this.levels[level] as bigint[];
      const parents: bigint[] = [];
      for (let i = 0; i < row.length; i += 2) {
        parents.push(hash([row[i] as bigint, row[i + 1] ?? (this.zeros[level] as bigint)]));
      }
      this.levels.push(parents);
    }
    this.root = (this.levels[depth]?.[0] ?? this.zeros[depth]) as bigint;
  }

  prove(index: number): MerklePath {
    const leaves = this.levels[0] as bigint[];
    if (index < 0 || index >= leaves.length) throw new Error("leaf index out of range");
    const siblings: bigint[] = [];
    const pathBits: number[] = [];
    let cursor = index;
    for (let level = 0; level < this.depth; level++) {
      const row = this.levels[level] as bigint[];
      siblings.push(row[cursor ^ 1] ?? (this.zeros[level] as bigint));
      pathBits.push(cursor & 1);
      cursor >>= 1;
    }
    return { siblings, pathBits };
  }
}

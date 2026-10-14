import { MAX_VALUE, SortedTree } from "./sorted-tree.ts";

/** A published sorted set: its values, the root they commit to, and free-form metadata. */
export type SetSnapshot<Meta> = {
  format: string;
  meta: Meta;
  depth: number;
  root: string;
  values: string[];
};

const toHex = (value: bigint, digits = 62) => `0x${value.toString(16).padStart(digits, "0")}`;

/** Builds the snapshot of a set: sorted, de-duplicated values and the root of the tree they form. */
export function buildSetSnapshot<Meta>(
  format: string,
  values: bigint[],
  depth: number,
  meta: Meta,
): { snapshot: SetSnapshot<Meta>; tree: SortedTree } {
  const sorted = [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const tree = new SortedTree(depth, sorted);
  return {
    snapshot: {
      format,
      meta,
      depth,
      root: toHex(tree.root, 64),
      values: sorted.map((value) => toHex(value)),
    },
    tree,
  };
}

/** Rebuilds the tree from a snapshot and refuses it unless every field is consistent with its root. */
export function openSetSnapshot(snapshot: SetSnapshot<unknown>, format: string): SortedTree {
  if (snapshot.format !== format) throw new Error("unsupported snapshot format");
  const values = snapshot.values.map((value) => {
    if (!/^0x[0-9a-f]{62}$/.test(value)) throw new Error("malformed snapshot value");
    return BigInt(value);
  });
  for (let i = 0; i < values.length; i++) {
    const value = values[i] as bigint;
    if (value <= 0n || value >= MAX_VALUE) throw new Error("snapshot value out of range");
    if (i > 0 && value <= (values[i - 1] as bigint)) {
      throw new Error("snapshot values are not sorted and unique");
    }
  }
  const tree = new SortedTree(snapshot.depth, values);
  if (toHex(tree.root, 64) !== snapshot.root)
    throw new Error("snapshot root does not match its values");
  return tree;
}

export const serializeSetSnapshot = (snapshot: SetSnapshot<unknown>): string =>
  `${JSON.stringify(snapshot, null, 1)}\n`;

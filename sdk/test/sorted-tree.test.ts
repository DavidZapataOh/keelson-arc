import { describe, expect, it } from "vitest";
import { MAX_VALUE, SortedTree } from "../src/sorted-tree.ts";

describe("SortedTree", () => {
  const tree = new SortedTree(4, [30n, 10n, 20n, 20n]);

  it("brackets absent values between neighbours", () => {
    expect(tree.prove(15n)).toMatchObject({ low: 10n, next: 20n });
    expect(tree.prove(5n)).toMatchObject({ low: 0n, next: 10n });
    expect(tree.prove(31n)).toMatchObject({ low: 30n, next: MAX_VALUE });
  });

  it("refuses to prove members, zero and the maximum", () => {
    expect(() => tree.prove(20n)).toThrow("member");
    expect(() => tree.prove(0n)).toThrow();
    expect(() => tree.prove(MAX_VALUE)).toThrow();
  });

  it("commits to the set, not to its order", () => {
    expect(new SortedTree(4, [20n, 30n, 10n]).root).toBe(tree.root);
    expect(new SortedTree(4, [10n, 20n]).root).not.toBe(tree.root);
  });

  it("supports an empty set", () => {
    expect(new SortedTree(2, []).prove(7n)).toMatchObject({ low: 0n, next: MAX_VALUE });
  });

  it("rejects values outside the 248-bit range", () => {
    expect(() => new SortedTree(2, [0n])).toThrow("values must be");
    expect(() => new SortedTree(2, [MAX_VALUE])).toThrow("values must be");
  });
});

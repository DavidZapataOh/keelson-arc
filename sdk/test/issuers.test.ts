import { describe, expect, it } from "vitest";
import { type IssuerKey, issuerLeaf } from "../src/credential.ts";
import { issuersRoot } from "../src/issuers.ts";
import { MerkleTree } from "../src/merkle.ts";

const key = (n: bigint): IssuerKey => ({ Ax: n, Ay: n + 1n });

describe("issuersRoot", () => {
  it("is the root of the issuers tree, in the order the keys are given", () => {
    const keys = [key(5n), key(9n)];
    expect(issuersRoot(keys)).toBe(new MerkleTree(4, keys.map(issuerLeaf)).root);
    expect(issuersRoot([...keys].reverse())).not.toBe(issuersRoot(keys));
  });

  it("differs for different issuers", () => {
    expect(issuersRoot([key(5n)])).not.toBe(issuersRoot([key(6n)]));
  });
});

import { expect, it } from "vitest";
import { hash } from "../src/poseidon.ts";

it("matches the circomlib Poseidon test vector", () => {
  expect(hash([1n, 2n])).toBe(
    7853200120776062878684798364095072458815029376092732009249414926327459813530n,
  );
});

it("is sensitive to input order and arity", () => {
  expect(hash([1n, 2n])).not.toBe(hash([2n, 1n]));
  expect(hash([1n])).not.toBe(hash([1n, 0n]));
});

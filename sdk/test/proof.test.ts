import { expect, it } from "vitest";
import { toCalldata } from "../src/proof.ts";

it("orders G2 coordinates imaginary part first and drops the projective coordinate", () => {
  const calldata = toCalldata({
    pi_a: ["1", "2", "1"],
    pi_b: [
      ["11", "12"],
      ["13", "14"],
      ["1", "0"],
    ],
    pi_c: ["5", "6", "1"],
  });
  expect(calldata).toEqual({
    a: [1n, 2n],
    b: [
      [12n, 11n],
      [14n, 13n],
    ],
    c: [5n, 6n],
  });
});

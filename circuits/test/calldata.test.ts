import { toCalldata } from "@keelson/sdk";
import * as snarkjs from "snarkjs";
import { expect, it } from "vitest";

it("matches the calldata snarkjs exports for a Solidity verifier", async () => {
  const proof = {
    pi_a: ["1", "2", "1"],
    pi_b: [
      ["11", "12"],
      ["13", "14"],
      ["1", "0"],
    ],
    pi_c: ["5", "6", "1"],
  };
  const exported = JSON.parse(`[${await snarkjs.groth16.exportSolidityCallData(proof, ["7"])}]`);
  const { a, b, c } = toCalldata(proof);
  expect([a, b, c]).toEqual(
    exported
      .slice(0, 3)
      .map((part: unknown) =>
        JSON.parse(JSON.stringify(part), (_, value) =>
          typeof value === "string" ? BigInt(value) : value,
        ),
      ),
  );
});

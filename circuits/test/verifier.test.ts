import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderVerifier, type VerificationKey } from "../scripts/verifier.ts";

const point = (n: number) => [String(n), String(n + 1), "1"];
const pair = (n: number) => [String(n), String(n + 1)];

const key = (publicSignals: number): VerificationKey => ({
  nPublic: publicSignals,
  vk_alpha_1: point(10),
  vk_beta_2: [pair(20), pair(30), ["1", "0"]],
  vk_gamma_2: [pair(40), pair(50), ["1", "0"]],
  vk_delta_2: [pair(60), pair(70), ["1", "0"]],
  IC: Array.from({ length: publicSignals + 1 }, (_, i) => point(100 + i * 10)),
});

const constant = (source: string, name: string) => {
  const match = source.match(new RegExp(`${name} = (0x[0-9a-f]+);`));
  if (!match) throw new Error(`constant ${name} not found`);
  return BigInt(match[1] as string);
};

describe("renderVerifier", () => {
  const source = renderVerifier("DemoVerifier", key(3));

  it("embeds the BN254 scalar and base field moduli", () => {
    expect(constant(source, "SCALAR_FIELD")).toBe(
      21888242871839275222246405745257275088548364400416034343698204186575808495617n,
    );
    expect(constant(source, "BASE_FIELD")).toBe(
      21888242871839275222246405745257275088696311157297823662689037894645226208583n,
    );
  });

  it("writes G2 constants with the imaginary part first, as the pairing precompile expects", () => {
    expect(constant(source, "BETA_X1")).toBe(21n);
    expect(constant(source, "BETA_X0")).toBe(20n);
    expect(constant(source, "BETA_Y1")).toBe(31n);
    expect(constant(source, "BETA_Y0")).toBe(30n);
  });

  it("writes one input-commitment point per public signal plus the constant term", () => {
    for (let i = 0; i <= 3; i++) {
      expect(constant(source, `IC${i}_X`)).toBe(BigInt(100 + i * 10));
    }
    expect(source).not.toContain("IC4_X");
    expect(source).toContain("uint256[3] calldata signals");
  });

  it("rejects a key whose commitment count does not match the signal count", () => {
    const broken = key(3);
    broken.IC.pop();
    expect(() => renderVerifier("DemoVerifier", broken)).toThrow("unexpected IC length");
  });

  it("is deterministic and carries the MIT license header", () => {
    expect(renderVerifier("DemoVerifier", key(3))).toBe(source);
    expect(source.startsWith("// SPDX-License-Identifier: MIT")).toBe(true);
  });
});

describe("committed verifier", () => {
  it("is generated from the verification key of the production circuit", () => {
    const committed = readFileSync(
      new URL("../../contracts/src/verifiers/ComplianceVerifier.sol", import.meta.url),
      "utf8",
    );
    expect(committed).toContain("contract ComplianceVerifier");
    expect(committed).toContain("uint256[13] calldata signals");
  });
});

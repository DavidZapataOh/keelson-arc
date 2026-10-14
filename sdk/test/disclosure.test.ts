import { describe, expect, it } from "vitest";
import { randomEphemeral, regulatorPublicKey } from "../src/disclosure.ts";

describe("disclosure keys", () => {
  it("derives a deterministic public key per secret", () => {
    expect(regulatorPublicKey(5n)).toEqual(regulatorPublicKey(5n));
    expect(regulatorPublicKey(5n)).not.toEqual(regulatorPublicKey(6n));
  });

  it("draws ephemeral scalars below 2^253 that do not repeat", () => {
    const draws = Array.from({ length: 64 }, randomEphemeral);
    expect(new Set(draws).size).toBe(draws.length);
    for (const draw of draws) {
      expect(draw).toBeGreaterThanOrEqual(0n);
      expect(draw).toBeLessThan(1n << 253n);
    }
  });
});

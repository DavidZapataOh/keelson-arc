import { describe, expect, it } from "vitest";
import { decide } from "../src/decide.ts";

const DAY = 86_400n;
const state = { current: 7n, updatedAt: 1_000_000n, maxAge: DAY };

describe("decide", () => {
  it("publishes whenever the snapshot root differs from the registry", () => {
    expect(decide(state, 8n, 1_000_000n)).toBe("publish");
    expect(decide({ ...state, current: 0n }, 8n, 1_000_000n)).toBe("publish");
  });

  it("leaves a fresh, unchanged root alone", () => {
    expect(decide(state, 7n, 1_000_000n)).toBe("unchanged");
    expect(decide(state, 7n, 1_000_000n + DAY / 4n - 1n)).toBe("unchanged");
  });

  it("refreshes an unchanged root once a quarter of its allowed age has passed", () => {
    expect(decide(state, 7n, 1_000_000n + DAY / 4n)).toBe("refresh");
    expect(decide(state, 7n, 1_000_000n + DAY)).toBe("refresh");
  });

  it("never refreshes a registry whose roots do not go stale", () => {
    expect(decide({ ...state, maxAge: 0n }, 7n, 1_000_000n + 100n * DAY)).toBe("unchanged");
  });
});

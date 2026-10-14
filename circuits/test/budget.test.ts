import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectCircuit } from "../scripts/inspect.ts";

const budget = JSON.parse(readFileSync(new URL("../budget.json", import.meta.url), "utf8"));
const main = (name: string) => new URL(`../main/${name}.circom`, import.meta.url).pathname;

describe("circuit budgets", () => {
  it("keeps Compliance within its constraint, ceremony and interface budget", async () => {
    const stats = await inspectCircuit(main("compliance"));
    expect(stats.constraints).toBeLessThanOrEqual(budget.compliance.maxConstraints);
    expect(stats.ceremonyPower).toBeLessThanOrEqual(budget.compliance.maxCeremonyPower);
    expect(stats.publicSignals).toBe(budget.compliance.publicSignals);
  }, 120_000);
});

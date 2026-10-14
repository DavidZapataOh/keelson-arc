import { expect, it } from "vitest";
import { buildFromSource } from "../../src/build.ts";
import { openSnapshot } from "../../src/snapshot.ts";
import { OFAC_ADVANCED_URL } from "../../src/source.ts";

it("builds a consistent snapshot from the current OFAC list within the circuit's capacity", async () => {
  const { snapshot, stats } = await buildFromSource(OFAC_ADVANCED_URL, 18);

  expect(stats.documents).toBeGreaterThan(20_000);
  expect(stats.addresses).toBeGreaterThan(500);
  expect(snapshot.values.length).toBeGreaterThan(20_000);
  expect(snapshot.values.length).toBeLessThan(2 ** 18 / 4);
  expect(snapshot.meta.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(openSnapshot(snapshot).root).toBe(BigInt(snapshot.root));
}, 180_000);

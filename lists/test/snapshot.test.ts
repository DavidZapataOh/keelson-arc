import { SANCTIONS_FORMAT } from "@keelson/sdk";
import { describe, expect, it } from "vitest";
import { buildSnapshot, openSnapshot, serializeSnapshot } from "../src/snapshot.ts";

const source = { name: "test", issued: "2026-01-01", sha256: "00" };

describe("sanctions snapshot", () => {
  it("is tagged with the sanctions format and carries its source", () => {
    const { snapshot } = buildSnapshot([5n, 7n], 4, source);
    expect(snapshot.format).toBe(SANCTIONS_FORMAT);
    expect(snapshot.meta).toEqual(source);
  });

  it("round-trips and refuses snapshots of another kind", () => {
    const { snapshot, tree } = buildSnapshot([5n, 7n], 4, source);
    expect(openSnapshot(JSON.parse(serializeSnapshot(snapshot))).root).toBe(tree.root);
    expect(() => openSnapshot({ ...snapshot, format: "keelson.revocations.v1" })).toThrow("format");
  });
});

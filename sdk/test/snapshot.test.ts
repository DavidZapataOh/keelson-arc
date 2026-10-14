import { describe, expect, it } from "vitest";
import { buildSetSnapshot, openSetSnapshot, serializeSetSnapshot } from "../src/snapshot.ts";

const FORMAT = "test.set.v1";
const meta = { note: "unit test" };
const values = [900n, 5n, 77n, 123456789n];
const hex62 = (value: bigint) => `0x${value.toString(16).padStart(62, "0")}`;

describe("set snapshot", () => {
  it("round-trips through JSON and reproduces the committed root", () => {
    const { snapshot, tree } = buildSetSnapshot(FORMAT, values, 6, meta);
    const reopened = openSetSnapshot(JSON.parse(serializeSetSnapshot(snapshot)), FORMAT);
    expect(reopened.root).toBe(tree.root);
    expect(BigInt(snapshot.root)).toBe(tree.root);
    expect(snapshot.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(snapshot.meta).toEqual(meta);
  });

  it("sorts and de-duplicates, so the same set always has the same root and bytes", () => {
    const a = buildSetSnapshot(FORMAT, [3n, 1n, 2n, 2n], 4, meta).snapshot;
    const b = buildSetSnapshot(FORMAT, [1n, 2n, 3n], 4, meta).snapshot;
    expect(serializeSetSnapshot(a)).toBe(serializeSetSnapshot(b));
    expect(a.values).toEqual([1n, 2n, 3n].map(hex62));
  });

  it("lets a holder prove non-membership against the opened tree", () => {
    const tree = openSetSnapshot(buildSetSnapshot(FORMAT, values, 6, meta).snapshot, FORMAT);
    expect(tree.prove(6n)).toMatchObject({ low: 5n, next: 77n });
    expect(() => tree.prove(77n)).toThrow("member");
  });

  it("refuses a snapshot whose values were edited", () => {
    const { snapshot } = buildSetSnapshot(FORMAT, values, 6, meta);
    const edited = { ...snapshot, values: [...snapshot.values] };
    edited.values[1] = hex62(6n);
    expect(() => openSetSnapshot(edited, FORMAT)).toThrow("does not match");
  });

  it("refuses a different depth, a different format and malformed or unordered values", () => {
    const { snapshot } = buildSetSnapshot(FORMAT, values, 6, meta);
    expect(() => openSetSnapshot({ ...snapshot, depth: 7 }, FORMAT)).toThrow("does not match");
    expect(() => openSetSnapshot(snapshot, "other.set.v1")).toThrow("format");
    expect(() => openSetSnapshot({ ...snapshot, values: ["0x01"] }, FORMAT)).toThrow("malformed");
    expect(() =>
      openSetSnapshot({ ...snapshot, values: [...snapshot.values].reverse() }, FORMAT),
    ).toThrow("sorted");
    expect(() => openSetSnapshot({ ...snapshot, values: [hex62(0n)] }, FORMAT)).toThrow(
      "out of range",
    );
  });

  it("rejects more values than the tree can hold", () => {
    expect(() => buildSetSnapshot(FORMAT, [1n, 2n, 3n, 4n], 2, meta)).toThrow("full");
  });
});

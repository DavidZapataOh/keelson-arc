import { MAX_VALUE, SortedTree } from "@keelson/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { compileFixture } from "./support.ts";

const tree = new SortedTree(8, [10n, 20n, 30n]);
let circuit: Awaited<ReturnType<typeof compileFixture>>;

const input = (value: bigint) => ({ root: tree.root, value, ...tree.prove(value) });
const accepts = async (signals: object) =>
  circuit.checkConstraints(await circuit.calculateWitness(signals, true));

describe("SortedNonMembership", () => {
  beforeAll(async () => {
    circuit = await compileFixture("sorted-non-membership");
  });

  it("accepts values between neighbours and at both ends", async () => {
    for (const value of [1n, 9n, 11n, 25n, 31n, MAX_VALUE - 1n]) {
      await accepts(input(value));
    }
  });

  it("rejects a member that borrows another leaf's bracket", async () => {
    await expect(accepts({ ...input(25n), value: 20n })).rejects.toThrow();
    await expect(accepts({ ...input(25n), value: 30n })).rejects.toThrow();
  });

  it("rejects zero, the maximum and values wider than 248 bits", async () => {
    await expect(accepts({ ...input(5n), value: 0n })).rejects.toThrow();
    await expect(accepts({ ...input(31n), value: MAX_VALUE })).rejects.toThrow();
    await expect(accepts({ ...input(31n), value: MAX_VALUE + 1n })).rejects.toThrow();
  });

  it("rejects a bracket that is not in the committed tree", async () => {
    await expect(accepts({ ...input(15n), low: 14n })).rejects.toThrow();
    await expect(accepts({ ...input(15n), next: 100n })).rejects.toThrow();
  });

  it("rejects a root other than the committed one", async () => {
    await expect(accepts({ ...input(15n), root: tree.root + 1n })).rejects.toThrow();
  });

  it("rejects a tampered path", async () => {
    const good = input(15n);
    const siblings = [...good.siblings];
    siblings[0] = (siblings[0] as bigint) + 1n;
    await expect(accepts({ ...good, siblings })).rejects.toThrow();
  });
});

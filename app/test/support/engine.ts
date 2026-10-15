import type { ListsEngine, ListsSummary } from "../../src/lists/engine.ts";

export const SUMMARY: ListsSummary = {
  roots: { issuers: 11n, sanctions: 22n, revocations: 33n },
  sanctionsIssued: "2026-10-13",
  revocationsUpdatedAt: 1_800_000_000,
  fetchedAt: 0,
};

/** A lists engine for component tests: the lists open instantly and nothing is revoked unless asked. */
type Options = {
  fail?: string;
  revoked?: boolean;
  load?: ListsEngine["load"];
  prove?: ListsEngine["prove"];
};

/** A lists engine for component tests: the lists open instantly and nothing is revoked unless asked. */
export const fakeEngine =
  (options: Options = {}): (() => ListsEngine) =>
  () => ({
    load:
      options.load ??
      (async () => {
        if (options.fail) throw new Error(options.fail);
        return SUMMARY;
      }),
    revoked: async (ids) => ids.map(() => options.revoked ?? false),
    prove:
      options.prove ??
      (async () => {
        throw new Error("proving is not available in this test");
      }),
  });

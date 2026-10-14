import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSetSnapshot,
  REVOCATION_DEPTH,
  REVOCATIONS_FORMAT,
  serializeSetSnapshot,
} from "@keelson/sdk";
import { describe, expect, it } from "vitest";
import type { Action } from "../src/decide.ts";
import type { RootSyncer } from "../src/publisher.ts";
import { syncRevocations } from "../src/revocations.ts";
import { syncSanctions } from "../src/sanctions.ts";

const sample = new URL("../../lists/test/fixtures/sdn_advanced_sample.xml", import.meta.url)
  .pathname;
const dir = () => mkdtempSync(join(tmpdir(), "keelson-keeper-"));

const syncer = (action: Action = "publish") => {
  const roots: bigint[] = [];
  const publisher: RootSyncer = {
    sync: async (root) => {
      roots.push(root);
      return { action };
    },
  };
  return { roots, publisher };
};

describe("syncSanctions", () => {
  it("stores the snapshot under a versioned name and as latest, then syncs its root", async () => {
    const dataDir = dir();
    const { roots, publisher } = syncer();
    const result = await syncSanctions({ source: sample, depth: 18, publisher, dataDir });

    expect(result).toMatchObject({ action: "publish", issued: "2026-10-13", identifiers: 22 });
    expect(roots).toEqual([BigInt(result.root)]);
    const latest = JSON.parse(readFileSync(join(dataDir, "sanctions-latest.json"), "utf8"));
    expect(latest.root).toBe(result.root);
    expect(
      existsSync(join(dataDir, `sanctions-2026-10-13-${latest.meta.sha256.slice(0, 8)}.json`)),
    ).toBe(true);
  });

  it("refuses a source list older than the one it already published, without touching the chain", async () => {
    const dataDir = dir();
    await syncSanctions({ source: sample, depth: 18, publisher: syncer().publisher, dataDir });

    const older = join(dir(), "older.xml");
    writeFileSync(older, readFileSync(sample, "utf8").replace("<Day>13</Day>", "<Day>12</Day>"));
    const { roots, publisher } = syncer();
    await expect(syncSanctions({ source: older, depth: 18, publisher, dataDir })).rejects.toThrow(
      "older than",
    );
    expect(roots).toEqual([]);
  });

  it("does not record a publication that failed", async () => {
    const dataDir = dir();
    const failing: RootSyncer = {
      sync: async () => {
        throw new Error("rpc down");
      },
    };
    await expect(
      syncSanctions({ source: sample, depth: 18, publisher: failing, dataDir }),
    ).rejects.toThrow("rpc down");
    expect(existsSync(join(dataDir, "sanctions-state.json"))).toBe(false);
  });
});

describe("syncRevocations", () => {
  const snapshotOf = (ids: bigint[], overrides = {}) => ({
    ...buildSetSnapshot(REVOCATIONS_FORMAT, ids, REVOCATION_DEPTH, { updatedAt: 1 }).snapshot,
    ...overrides,
  });
  const serve = (body: unknown, status = 200): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

  it("verifies and stores the issuer's snapshot, then syncs its root", async () => {
    const dataDir = dir();
    const { roots, publisher } = syncer();
    const snapshot = snapshotOf([5n, 9n]);
    const result = await syncRevocations({
      url: "http://issuer/revocations",
      publisher,
      dataDir,
      fetchImpl: serve(snapshot),
    });

    expect(result).toEqual({ action: "publish", root: snapshot.root, revoked: 2 });
    expect(roots).toEqual([BigInt(snapshot.root)]);
    expect(readFileSync(join(dataDir, "revocations-latest.json"), "utf8")).toBe(
      serializeSetSnapshot(snapshot),
    );
  });

  it("refuses a snapshot that does not match its root, has the wrong depth or came from a failing issuer", async () => {
    const { roots, publisher } = syncer();
    const run = (fetchImpl: typeof fetch) =>
      syncRevocations({ url: "http://issuer/revocations", publisher, dataDir: dir(), fetchImpl });

    await expect(run(serve(snapshotOf([5n], { root: `0x${"1".repeat(64)}` })))).rejects.toThrow(
      "does not match",
    );
    await expect(run(serve(snapshotOf([5n], { depth: 8 })))).rejects.toThrow("wrong depth");
    await expect(run(serve({}, 503))).rejects.toThrow("503");
    expect(roots).toEqual([]);
  });

  it("refuses a snapshot that un-revokes an id it published before", async () => {
    const dataDir = dir();
    const { roots, publisher } = syncer();
    await syncRevocations({ url: "u", publisher, dataDir, fetchImpl: serve(snapshotOf([5n, 9n])) });
    await expect(
      syncRevocations({ url: "u", publisher, dataDir, fetchImpl: serve(snapshotOf([5n])) }),
    ).rejects.toThrow("no longer contains");
    expect(roots).toHaveLength(1);

    await syncRevocations({
      url: "u",
      publisher,
      dataDir,
      fetchImpl: serve(snapshotOf([5n, 9n, 11n])),
    });
    expect(roots).toHaveLength(2);
  });
});

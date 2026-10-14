import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp, IssuerService, Store } from "@keelson/issuer";
import { Keeper, RootPublisher, syncRevocations, syncSanctions } from "@keelson/keeper";
import { buildFromSource, openSnapshot } from "@keelson/lists";
import {
  type Deployment,
  issuerFromKey,
  regulatorPublicKey,
  rootRegistryAbi,
  SANCTIONS_DEPTH,
  subjectOf,
} from "@keelson/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deploySystem, type LocalChain, startChain } from "./support/chain.ts";

const SAMPLE = resolve(
  new URL("../../lists/test/fixtures/sdn_advanced_sample.xml", import.meta.url).pathname,
);
const DAY = 86_400;

let chain: LocalChain;
let deployment: Deployment;
let issuer: IssuerService;
let server: Server;
let issuerUrl: string;
let sanctionsSource = SAMPLE;
let dataDir: string;
let keeper: Keeper;
const log: Record<string, unknown>[] = [];

const read = (address: `0x${string}`, functionName: "current" | "updatedAt" | "version") =>
  chain.publicClient.readContract({ address, abi: rootRegistryAbi, functionName });
const accepted = (address: `0x${string}`, root: bigint) =>
  chain.publicClient.readContract({
    address,
    abi: rootRegistryAbi,
    functionName: "acceptedVersion",
    args: [root],
  });

const advance = async (seconds: number) => {
  await chain.publicClient.request({
    method: "evm_increaseTime" as never,
    params: [seconds] as never,
  });
  await chain.publicClient.request({ method: "evm_mine" as never, params: [] as never });
};

const results = async () =>
  Object.fromEntries((await keeper.tick()).map((report) => [report.job, report]));

beforeAll(async () => {
  chain = await startChain();
  const key = regulatorPublicKey(1n);
  deployment = deploySystem(chain, { regulatorKeyX: key.x, regulatorKeyY: key.y });

  const { snapshot } = await buildFromSource(SAMPLE, SANCTIONS_DEPTH);
  issuer = new IssuerService(
    issuerFromKey(new Uint8Array(32).fill(7)),
    new Store(":memory:"),
    openSnapshot(snapshot),
  );
  server = createApp(issuer, { adminToken: "a".repeat(32), regulatorToken: "r".repeat(32) });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  issuerUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  dataDir = mkdtempSync(join(tmpdir(), "keelson-keeper-e2e-"));
  const wallet = chain.wallet("owner");
  const sanctions = new RootPublisher(chain.publicClient, wallet, deployment.sanctions);
  const revocations = new RootPublisher(chain.publicClient, wallet, deployment.revocations);
  keeper = new Keeper(
    [
      {
        name: "sanctions",
        run: () =>
          syncSanctions({
            source: sanctionsSource,
            depth: SANCTIONS_DEPTH,
            publisher: sanctions,
            dataDir,
          }),
      },
      {
        name: "revocations",
        run: () =>
          syncRevocations({ url: `${issuerUrl}/revocations`, publisher: revocations, dataDir }),
      },
    ],
    (entry) => log.push(entry),
  );
});

afterAll(async () => {
  chain?.stop();
  await new Promise((resolveClose) => server?.close(resolveClose));
});

describe("keeper against a live chain", () => {
  it("publishes both roots on the first run and nothing on the second", async () => {
    const first = await results();
    expect(first.sanctions).toMatchObject({ ok: true, result: { action: "publish" } });
    expect(first.revocations).toMatchObject({ ok: true, result: { action: "publish" } });

    const sanctionsRoot = BigInt((first.sanctions as { result: { root: string } }).result.root);
    expect(await read(deployment.sanctions, "current")).toBe(sanctionsRoot);
    expect(await read(deployment.sanctions, "version")).toBe(1n);

    const second = await results();
    expect(second.sanctions).toMatchObject({ ok: true, result: { action: "unchanged" } });
    expect(second.revocations).toMatchObject({ ok: true, result: { action: "unchanged" } });
  });

  it("publishes a new revocation root as soon as the issuer revokes something", async () => {
    const issued = issuer.issue({
      subject: subjectOf(5n),
      tier: 2,
      jurisdiction: 840,
      expiry: Math.floor(Date.now() / 1000) + 30 * DAY,
      identifiers: [
        { kind: "id", value: "LEI 5493001KJTIIGC8Y1R12" },
        { kind: "address", value: "0x1111111111111111111111111111111111111111" },
      ],
      entityRef: "keeper-e2e",
    });
    const before = await read(deployment.revocations, "current");
    issuer.revoke(issued.claims.credentialId);

    const report = await results();
    expect(report.revocations).toMatchObject({
      ok: true,
      result: { action: "publish", revoked: 1 },
    });
    expect(report.sanctions).toMatchObject({ ok: true, result: { action: "unchanged" } });
    expect(await read(deployment.revocations, "current")).not.toBe(before);
  });

  it("refreshes unchanged roots before they go stale, and recovers a registry that already did", async () => {
    await advance(DAY / 4 + 10);
    const refreshed = await results();
    expect(refreshed.sanctions).toMatchObject({ result: { action: "refresh" } });
    expect(refreshed.revocations).toMatchObject({ result: { action: "refresh" } });

    // the keeper is down for more than a day: the list goes stale and proofs against it stop being accepted
    const root = await read(deployment.sanctions, "current");
    expect(await accepted(deployment.sanctions, root)).toBe(1n);
    await advance(DAY + 10);
    expect(await accepted(deployment.sanctions, root)).toBe(0n);

    const recovered = await results();
    expect(recovered.sanctions).toMatchObject({ result: { action: "refresh" } });
    expect(await accepted(deployment.sanctions, root)).toBe(1n);
  });

  it("reports a source that went backwards and leaves the chain alone", async () => {
    const older = join(mkdtempSync(join(tmpdir(), "keelson-older-")), "older.xml");
    writeFileSync(older, readFileSync(SAMPLE, "utf8").replace("<Day>13</Day>", "<Day>01</Day>"));
    sanctionsSource = older;
    const version = await read(deployment.sanctions, "version");

    const report = await results();
    expect(report.sanctions).toMatchObject({ ok: false });
    expect((report.sanctions as { error: string }).error).toContain("older than");
    expect(report.revocations).toMatchObject({ ok: true });
    expect(await read(deployment.sanctions, "version")).toBe(version);
  });
});

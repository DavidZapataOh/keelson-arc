import {
  buildSetSnapshot,
  ISSUER_DEPTH,
  issuerFromKey,
  issuerLeaf,
  MerkleTree,
  REVOCATIONS_FORMAT,
  SANCTIONS_FORMAT,
  serializeSetSnapshot,
} from "@keelson/sdk";
import { rootRegistryAbi } from "@keelson/sdk/abi";
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
} from "viem";
import { arc } from "viem/chains";
import { describe, expect, it } from "vitest";
import { ListError, loadLists } from "../src/lists/fetch.ts";
import { listStatus } from "../src/lists/status.ts";
import { ADDRESSES } from "./support/fakeChain.ts";

const issuer = issuerFromKey(new Uint8Array(32).fill(7));
const URLS = { listsUrl: "https://lists.example.org", issuerUrl: "https://issuer.example.org" };

const sanctions = buildSetSnapshot(SANCTIONS_FORMAT, [5n, 9n, 400n], 18, {
  name: "SDN",
  issued: "2026-10-13",
  sha256: "00",
});
const revocations = buildSetSnapshot(REVOCATIONS_FORMAT, [77n], 16, { updatedAt: 1_800_000_000 });

type Files = Record<string, unknown>;
const filesFor = (overrides: Files = {}): Files => ({
  [`${URLS.listsUrl}/sanctions-latest.json`]: JSON.parse(serializeSetSnapshot(sanctions.snapshot)),
  [`${URLS.listsUrl}/revocations-latest.json`]: JSON.parse(
    serializeSetSnapshot(revocations.snapshot),
  ),
  [`${URLS.issuerUrl}/issuer`]: { Ax: issuer.Ax.toString(), Ay: issuer.Ay.toString() },
  ...overrides,
});

const server = (files: Files, requested: string[] = []): typeof fetch =>
  (async (url: string) => {
    requested.push(url);
    if (!(url in files)) return new Response("missing", { status: 404 });
    return new Response(JSON.stringify(files[url]));
  }) as unknown as typeof fetch;

const reason = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ListError) return `${error.list}: ${error.message}`;
    throw error;
  }
  return "none";
};

describe("lists", () => {
  it("opens the three lists and rebuilds the issuer tree from the issuer key", async () => {
    const lists = await loadLists(URLS, server(filesFor()), () => 42);
    expect(lists.sanctions.root).toBe(sanctions.tree.root);
    expect(lists.revocations.contains(77n)).toBe(true);
    expect(lists.issuers.root).toBe(new MerkleTree(ISSUER_DEPTH, [issuerLeaf(issuer)]).root);
    expect(lists.sanctionsIssued).toBe("2026-10-13");
    expect(lists.revocationsUpdatedAt).toBe(1_800_000_000);
    expect(lists.fetchedAt).toBe(42);
  });

  it("only downloads whole files: no request carries an identifier", async () => {
    const requested: string[] = [];
    await loadLists(URLS, server(filesFor(), requested));
    expect(requested.sort()).toEqual([
      `${URLS.issuerUrl}/issuer`,
      `${URLS.listsUrl}/revocations-latest.json`,
      `${URLS.listsUrl}/sanctions-latest.json`,
    ]);
  });

  it("refuses a list whose value was changed, whose root is wrong or that is unsorted", async () => {
    const snapshot = JSON.parse(serializeSetSnapshot(sanctions.snapshot)) as {
      values: string[];
      root: string;
    };
    const url = `${URLS.listsUrl}/sanctions-latest.json`;

    const changed = {
      ...snapshot,
      values: [snapshot.values[0], snapshot.values[1], `0x${"0".repeat(61)}1`],
    };
    expect(await reason(() => loadLists(URLS, server(filesFor({ [url]: changed }))))).toMatch(
      /^sanctions: .*refused/,
    );

    const wrongRoot = { ...snapshot, root: `0x${"1".repeat(64)}` };
    expect(await reason(() => loadLists(URLS, server(filesFor({ [url]: wrongRoot }))))).toMatch(
      /root does not match/,
    );

    const unsorted = { ...snapshot, values: [...snapshot.values].reverse() };
    expect(await reason(() => loadLists(URLS, server(filesFor({ [url]: unsorted }))))).toMatch(
      /not sorted/,
    );
  });

  it("refuses a snapshot in the wrong format and a malformed issuer key", async () => {
    const url = `${URLS.listsUrl}/revocations-latest.json`;
    const wrongFormat = { ...JSON.parse(serializeSetSnapshot(revocations.snapshot)), format: "x" };
    expect(await reason(() => loadLists(URLS, server(filesFor({ [url]: wrongFormat }))))).toMatch(
      /unsupported snapshot format/,
    );
    const key = `${URLS.issuerUrl}/issuer`;
    expect(await reason(() => loadLists(URLS, server(filesFor({ [key]: { Ax: 1 } }))))).toMatch(
      /^issuers: .*malformed/,
    );
  });

  it("reports an unreachable or oversized list by name", async () => {
    const files = filesFor();
    delete files[`${URLS.listsUrl}/sanctions-latest.json`];
    expect(await reason(() => loadLists(URLS, server(files)))).toMatch(/^sanctions: .*404/);
    const big = (async () =>
      new Response("{}", {
        headers: { "content-length": String(10 ** 9) },
      })) as unknown as typeof fetch;
    expect(await reason(() => loadLists(URLS, big))).toMatch(/too large/);
  });

  it("opens a sanctions list of realistic size in reasonable time", async () => {
    const values = Array.from({ length: 20_000 }, (_, i) => BigInt(i + 1) * 1_000_003n);
    const { snapshot } = buildSetSnapshot(SANCTIONS_FORMAT, values, 18, {
      name: "SDN",
      issued: "2026-10-13",
      sha256: "00",
    });
    const files = filesFor({
      [`${URLS.listsUrl}/sanctions-latest.json`]: JSON.parse(serializeSetSnapshot(snapshot)),
    });
    const started = performance.now();
    await loadLists(URLS, server(files));
    expect(performance.now() - started).toBeLessThan(20_000);
  }, 60_000);
});

const word = (value: bigint): Hex => encodeAbiParameters([{ type: "uint64" }], [value]);

describe("list status", () => {
  const lists = {
    issuers: new MerkleTree(ISSUER_DEPTH, [issuerLeaf(issuer)]).root,
    sanctions: sanctions.tree.root,
    revocations: revocations.tree.root,
  };
  const client = (answer: (registry: string, root: bigint) => bigint | "fail") =>
    createPublicClient({
      chain: arc,
      transport: custom({
        request: async ({ method, params }: { method: string; params?: unknown }) => {
          const { to, data } = (params as { to: string; data: Hex }[])[0] as {
            to: string;
            data: Hex;
          };
          if (method !== "eth_call") throw new Error(method);
          const { args } = decodeFunctionData({ abi: rootRegistryAbi, data });
          const result = answer(to.toLowerCase(), (args as unknown as bigint[])[0] as bigint);
          if (result === "fail") throw new Error("node down");
          return word(result);
        },
      }),
    });

  it("marks a list accepted only when its registry knows the root", async () => {
    const accepted = client((registry) =>
      registry === ADDRESSES.sanctions.toLowerCase() ? 12n : 0n,
    );
    const status = await listStatus(accepted, ADDRESSES, lists);
    expect(status.map((s) => [s.name, s.state, s.version])).toEqual([
      ["Issuers", "stale", 0n],
      ["Sanctions", "accepted", 12n],
      ["Revocations", "stale", 0n],
    ]);
  });

  it("reports unknown, never accepted, when the read fails", async () => {
    const status = await listStatus(
      client(() => "fail"),
      ADDRESSES,
      lists,
    );
    expect(status.every((s) => s.state === "unknown")).toBe(true);
  });
});

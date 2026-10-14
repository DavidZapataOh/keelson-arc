import { MerkleTree } from "@keelson/sdk/merkle";
import { ISSUER_DEPTH, REVOCATIONS_FORMAT, SANCTIONS_FORMAT } from "@keelson/sdk/parameters";
import { hash } from "@keelson/sdk/poseidon";
import { openSetSnapshot, type SetSnapshot } from "@keelson/sdk/snapshot";
import type { SortedTree } from "@keelson/sdk/sorted-tree";

export const MAX_BYTES = 48 * 1024 * 1024;

export class ListError extends Error {
  readonly list: "sanctions" | "revocations" | "issuers";

  constructor(list: ListError["list"], message: string) {
    super(message);
    this.name = "ListError";
    this.list = list;
  }
}

export type Lists = {
  issuers: MerkleTree;
  sanctions: SortedTree;
  revocations: SortedTree;
  sanctionsIssued: string | undefined;
  revocationsUpdatedAt: number | undefined;
  fetchedAt: number;
};

async function download(
  url: string,
  list: ListError["list"],
  fetcher: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url);
  } catch {
    throw new ListError(list, `the ${list} list could not be reached`);
  }
  if (!response.ok) throw new ListError(list, `the ${list} list answered ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new ListError(list, `the ${list} list is too large`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new ListError(list, `the ${list} list is too large`);
  try {
    return JSON.parse(text);
  } catch {
    throw new ListError(list, `the ${list} list is not valid JSON`);
  }
}

function open(
  list: "sanctions" | "revocations",
  snapshot: unknown,
  format: string,
): { tree: SortedTree; meta: Record<string, unknown> } {
  try {
    const typed = snapshot as SetSnapshot<Record<string, unknown>>;
    return { tree: openSetSnapshot(typed, format), meta: typed.meta ?? {} };
  } catch (cause) {
    throw new ListError(list, `the ${list} list was refused: ${(cause as Error).message}`);
  }
}

async function loadIssuers(issuerUrl: string, fetcher: typeof fetch): Promise<MerkleTree> {
  const key = (await download(`${issuerUrl}/issuer`, "issuers", fetcher)) as {
    Ax?: unknown;
    Ay?: unknown;
  };
  if (
    typeof key.Ax !== "string" ||
    typeof key.Ay !== "string" ||
    !/^[0-9]+$/.test(key.Ax + key.Ay)
  ) {
    throw new ListError("issuers", "the issuer key is malformed");
  }
  return new MerkleTree(ISSUER_DEPTH, [hash([BigInt(key.Ax), BigInt(key.Ay)])]);
}

/** Downloads the three lists whole. No request carries an identifier, a subject or a path. */
export async function loadLists(
  urls: { listsUrl: string; issuerUrl: string },
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<Lists> {
  const [sanctionsRaw, revocationsRaw, issuers] = await Promise.all([
    download(`${urls.listsUrl}/sanctions-latest.json`, "sanctions", fetcher),
    download(`${urls.listsUrl}/revocations-latest.json`, "revocations", fetcher),
    loadIssuers(urls.issuerUrl, fetcher),
  ]);
  const sanctions = open("sanctions", sanctionsRaw, SANCTIONS_FORMAT);
  const revocations = open("revocations", revocationsRaw, REVOCATIONS_FORMAT);
  return {
    issuers,
    sanctions: sanctions.tree,
    revocations: revocations.tree,
    sanctionsIssued: typeof sanctions.meta.issued === "string" ? sanctions.meta.issued : undefined,
    revocationsUpdatedAt:
      typeof revocations.meta.updatedAt === "number" ? revocations.meta.updatedAt : undefined,
    fetchedAt: now(),
  };
}

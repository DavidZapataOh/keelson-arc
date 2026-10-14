import { join } from "node:path";
import {
  openSetSnapshot,
  REVOCATION_DEPTH,
  REVOCATIONS_FORMAT,
  type SetSnapshot,
  serializeSetSnapshot,
} from "@keelson/sdk";
import type { Action } from "./decide.ts";
import { readJson, writeAtomic } from "./files.ts";
import type { RootSyncer } from "./publisher.ts";

export type RevocationsSync = { action: Action; root: string; revoked: number };

type Snapshot = SetSnapshot<unknown>;

/**
 * Fetches the issuer's revocation snapshot, verifies it, and brings the on-chain registry in line.
 * A revocation set only ever grows, so a snapshot that drops an id already published is refused.
 */
export async function syncRevocations(args: {
  url: string;
  publisher: RootSyncer;
  dataDir: string;
  fetchImpl?: typeof fetch;
}): Promise<RevocationsSync> {
  const response = await (args.fetchImpl ?? fetch)(args.url);
  if (!response.ok)
    throw new Error(`issuer returned ${response.status} for the revocation snapshot`);
  const snapshot = (await response.json()) as Snapshot;

  if (snapshot.depth !== REVOCATION_DEPTH)
    throw new Error("revocation snapshot has the wrong depth");
  const tree = openSetSnapshot(snapshot, REVOCATIONS_FORMAT);

  const latest = join(args.dataDir, "revocations-latest.json");
  const previous = readJson<Snapshot>(latest);
  if (previous) {
    const next = new Set(snapshot.values);
    const missing = previous.values.find((value) => !next.has(value));
    if (missing)
      throw new Error(
        `revocation snapshot no longer contains ${missing}, which was published before`,
      );
  }

  writeAtomic(latest, serializeSetSnapshot(snapshot));
  const { action } = await args.publisher.sync(tree.root);
  return { action, root: snapshot.root, revoked: snapshot.values.length };
}

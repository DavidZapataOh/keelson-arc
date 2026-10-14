import { join } from "node:path";
import { buildFromSource, serializeSnapshot } from "@keelson/lists";
import type { Action } from "./decide.ts";
import { readJson, writeAtomic } from "./files.ts";
import type { RootSyncer } from "./publisher.ts";

export type SanctionsSync = { action: Action; root: string; issued: string; identifiers: number };

type State = { issued: string; sha256: string; root: string };

/**
 * Rebuilds the sanctions snapshot from the source list, stores it where clients download it,
 * and brings the on-chain registry in line. Refuses a list older than the last one it published.
 */
export async function syncSanctions(args: {
  source: string;
  depth: number;
  publisher: RootSyncer;
  dataDir: string;
}): Promise<SanctionsSync> {
  const statePath = join(args.dataDir, "sanctions-state.json");
  const previous = readJson<State>(statePath);

  const { snapshot, tree } = await buildFromSource(args.source, args.depth);
  const { issued, sha256 } = snapshot.meta;
  if (previous && issued < previous.issued) {
    throw new Error(
      `source list issued ${issued} is older than the published list issued ${previous.issued}`,
    );
  }

  writeAtomic(
    join(args.dataDir, `sanctions-${issued}-${sha256.slice(0, 8)}.json`),
    serializeSnapshot(snapshot),
  );
  writeAtomic(join(args.dataDir, "sanctions-latest.json"), serializeSnapshot(snapshot));

  const { action } = await args.publisher.sync(tree.root);
  writeAtomic(statePath, `${JSON.stringify({ issued, sha256, root: snapshot.root })}\n`);
  return { action, root: snapshot.root, issued, identifiers: snapshot.values.length };
}

import { parseAdvanced } from "./ofac.ts";
import { buildSnapshot } from "./snapshot.ts";
import { openSource } from "./source.ts";

/** Reads the OFAC list at `location` and returns the snapshot of its structured identifiers. */
export async function buildFromSource(location: string, depth: number) {
  const source = await openSource(location);
  const list = await parseAdvanced(source.chunks);
  const result = buildSnapshot(list.values, depth, {
    name: "ofac-sdn-advanced",
    issued: list.issued,
    sha256: source.sha256(),
  });
  return { ...result, stats: list.stats };
}

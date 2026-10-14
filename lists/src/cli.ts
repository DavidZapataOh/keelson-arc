import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildFromSource } from "./build.ts";
import { serializeSnapshot } from "./snapshot.ts";
import { OFAC_ADVANCED_URL } from "./source.ts";

const { values } = parseArgs({
  options: {
    input: { type: "string", default: OFAC_ADVANCED_URL },
    out: { type: "string" },
    depth: { type: "string", default: "18" },
  },
});

if (!values.out) {
  console.error("usage: node src/cli.ts --out <snapshot.json> [--input <file|url>] [--depth 18]");
  process.exit(1);
}

const { snapshot, stats } = await buildFromSource(values.input, Number(values.depth));
writeFileSync(values.out, serializeSnapshot(snapshot));
console.log(
  `${snapshot.values.length} identifiers (${stats.documents} documents, ${stats.addresses} addresses, ${stats.features} features, ${stats.skipped} skipped as too short)`,
);
console.log(`issued ${snapshot.meta.issued}, root ${snapshot.root}`);

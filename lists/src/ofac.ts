import { SaxesParser } from "saxes";
import { type Identifier, identifierHash } from "./identifiers.ts";

const ADDRESS_FEATURE_PREFIX = "Digital Currency Address - ";
const ID_FEATURES = new Set(["SWIFT/BIC", "D-U-N-S Number"]);

export type ParsedList = {
  issued: string;
  values: bigint[];
  stats: { documents: number; addresses: number; features: number; skipped: number };
};

/** Streams an OFAC `SDN_ADVANCED.XML` document and collects the hashes of its structured identifiers. */
export async function parseAdvanced(source: AsyncIterable<Uint8Array>): Promise<ParsedList> {
  const parser = new SaxesParser();
  const decoder = new TextDecoder();
  const values = new Set<bigint>();
  const stats = { documents: 0, addresses: 0, features: 0, skipped: 0 };
  const featureTypes = new Map<string, string>();
  const date: Record<string, string> = {};

  let featureType: string | undefined;
  let featureTypeId = "";
  let area = "";
  let text = "";

  const add = (identifier: Identifier, counter: "documents" | "addresses" | "features") => {
    const hash = identifierHash(identifier);
    if (hash === undefined) {
      stats.skipped++;
      return;
    }
    stats[counter]++;
    values.add(hash);
  };

  parser.on("opentag", (tag) => {
    text = "";
    if (tag.name === "FeatureType") featureTypeId = String(tag.attributes.ID);
    if (tag.name === "Feature")
      featureType = featureTypes.get(String(tag.attributes.FeatureTypeID));
    area = tag.name;
  });
  parser.on("text", (chunk) => {
    text += chunk;
  });
  parser.on("closetag", (tag) => {
    const value = text.trim();
    switch (tag.name) {
      case "FeatureType":
        featureTypes.set(featureTypeId, value);
        break;
      case "VersionDetail":
        if (featureType?.startsWith(ADDRESS_FEATURE_PREFIX)) {
          add({ kind: "address", value }, "addresses");
        } else if (featureType && ID_FEATURES.has(featureType)) {
          add({ kind: "id", value }, "features");
        }
        break;
      case "Feature":
        featureType = undefined;
        break;
      case "IDRegistrationNo":
        add({ kind: "id", value }, "documents");
        break;
      case "Year":
      case "Month":
      case "Day":
        if (area === tag.name && !date[tag.name]) date[tag.name] = value;
        break;
    }
    text = "";
  });

  for await (const chunk of source) parser.write(decoder.decode(chunk, { stream: true }));
  parser.write(decoder.decode());
  parser.close();

  const pad = (n: string | undefined, width: number) => (n ?? "").padStart(width, "0");
  return {
    issued: `${pad(date.Year, 4)}-${pad(date.Month, 2)}-${pad(date.Day, 2)}`,
    values: [...values],
    stats,
  };
}

import { readFileSync } from "node:fs";
import { IDENTIFIER_COUNT, ISSUER_DEPTH, REVOCATION_DEPTH, SANCTIONS_DEPTH } from "@keelson/sdk";
import { expect, it } from "vitest";

it("keeps the SDK's circuit parameters in step with the production circuit", () => {
  const source = readFileSync(new URL("../main/compliance.circom", import.meta.url), "utf8");
  const match = source.match(/Compliance\((\d+), (\d+), (\d+), (\d+)\)/);
  expect(match?.slice(1).map(Number)).toEqual([
    ISSUER_DEPTH,
    SANCTIONS_DEPTH,
    REVOCATION_DEPTH,
    IDENTIFIER_COUNT,
  ]);
});

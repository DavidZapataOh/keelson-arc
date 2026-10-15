import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildCircuit } from "./build.ts";
import { CEREMONY_DIR } from "./ceremony.ts";

export const COMPLIANCE_SOURCE = new URL("../main/compliance.circom", import.meta.url).pathname;

export type Keys = {
  wasm: string;
  zkey: string;
  vkey: string;
  source: "ceremony" | "development";
};

/** Reproducible keys for test networks; they must never guard real funds. */
export async function developmentKeys(): Promise<Keys> {
  const built = await buildCircuit("compliance", COMPLIANCE_SOURCE);
  return { wasm: built.wasm, zkey: built.zkey, vkey: built.vkey, source: "development" };
}

/**
 * The proving and verification keys the system runs with: the published ceremony's when there is
 * one, otherwise reproducible development keys that must never guard real funds.
 */
export async function productionKeys(): Promise<Keys> {
  const dir = join(CEREMONY_DIR, "compliance");
  if (existsSync(join(dir, "transcript.json"))) {
    return {
      wasm: join(dir, "compliance.wasm"),
      zkey: join(dir, "compliance_final.zkey"),
      vkey: join(dir, "verification_key.json"),
      source: "ceremony",
    };
  }
  return developmentKeys();
}

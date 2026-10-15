import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MerkleTree } from "@keelson/sdk";
import * as snarkjs from "snarkjs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCircuit } from "../scripts/build.ts";
import {
  contribute,
  finalizeCeremony,
  startCeremony,
  verifyCeremony,
} from "../scripts/ceremony.ts";

const source = new URL("./fixtures/merkle.circom", import.meta.url).pathname;
const tree = new MerkleTree(4, [101n, 202n, 303n]);
const BEACON = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

const work = mkdtempSync(join(tmpdir(), "keelson-ceremony-"));
const out = mkdtempSync(join(tmpdir(), "keelson-ceremony-out-"));

describe("ceremony", () => {
  beforeAll(async () => {
    await startCeremony({ name: "merkle", source, work });
    await contribute({ work, name: "first", entropy: "entropy of the first contributor" });
    await contribute({ work, name: "second", entropy: "entropy of the second contributor" });
    await finalizeCeremony({
      name: "merkle",
      source,
      work,
      beacon: BEACON,
      iterationsExp: 10,
      out,
    });
  }, 300_000);

  it("records every contribution and the beacon in the transcript", () => {
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8"));
    expect(transcript.contributions.map((c: { name: string }) => c.name)).toEqual([
      "first",
      "second",
    ]);
    expect(transcript.beacon).toEqual({ hash: BEACON, iterationsExp: 10 });
    expect(transcript.constraints).toBeGreaterThan(0);
  });

  it("produces keys that prove and verify, and that differ from the development keys", async () => {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      { leaf: 202n, ...tree.prove(1) },
      join(out, "merkle.wasm"),
      join(out, "merkle_final.zkey"),
    );
    const vkey = JSON.parse(readFileSync(join(out, "verification_key.json"), "utf8"));
    expect(await snarkjs.groth16.verify(vkey, publicSignals, proof)).toBe(true);

    const development = await buildCircuit("merkle", source, "merkle-ceremony");
    expect(vkey.vk_delta_2).not.toEqual(
      JSON.parse(readFileSync(development.vkey, "utf8")).vk_delta_2,
    );
  }, 120_000);

  it("verifies from source, and refuses a key, a witness generator or a transcript that was altered", async () => {
    await verifyCeremony({ name: "merkle", source, dir: out });

    const zkey = join(out, "merkle_final.zkey");
    const original = readFileSync(zkey);
    const altered = Buffer.from(original);
    altered[altered.length - 5] = (altered[altered.length - 5] as number) ^ 1;
    writeFileSync(zkey, altered);
    await expect(verifyCeremony({ name: "merkle", source, dir: out })).rejects.toThrow(
      "the final key",
    );
    writeFileSync(zkey, original);

    const transcriptFile = join(out, "transcript.json");
    const transcript = readFileSync(transcriptFile, "utf8");
    writeFileSync(
      transcriptFile,
      transcript
        .replace(/"constraints": \d+/, '"constraints": 1')
        .replace(/"wasmSha256": "[0-9a-f]{64}"/, `"wasmSha256": "${"0".repeat(64)}"`),
    );
    await expect(verifyCeremony({ name: "merkle", source, dir: out })).rejects.toThrow(
      "the witness generator",
    );
    writeFileSync(transcriptFile, transcript);
    await verifyCeremony({ name: "merkle", source, dir: out });
  }, 240_000);

  it("refuses to finalize without a contribution", async () => {
    const empty = mkdtempSync(join(tmpdir(), "keelson-ceremony-empty-"));
    await startCeremony({ name: "merkle", source, work: empty });
    await expect(
      finalizeCeremony({
        name: "merkle",
        source,
        work: empty,
        beacon: BEACON,
        iterationsExp: 10,
        out: empty,
      }),
    ).rejects.toThrow("at least one contribution");
  }, 120_000);
});

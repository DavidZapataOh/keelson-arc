import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openSnapshot, type SanctionsSnapshot } from "../src/snapshot.ts";

const sample = new URL("./fixtures/sdn_advanced_sample.xml", import.meta.url).pathname;
const cli = new URL("../src/cli.ts", import.meta.url).pathname;

it("builds a verifiable snapshot from a list file and reports what it read", () => {
  const out = join(mkdtempSync(join(tmpdir(), "keelson-list-")), "snapshot.json");
  const stdout = execFileSync("node", [cli, "--input", sample, "--out", out, "--depth", "8"], {
    encoding: "utf8",
  });

  const snapshot = JSON.parse(readFileSync(out, "utf8")) as SanctionsSnapshot;
  expect(openSnapshot(snapshot).root).toBe(BigInt(snapshot.root));
  expect(snapshot.values).toHaveLength(22);
  expect(snapshot.depth).toBe(8);
  expect(snapshot.meta).toEqual({
    name: "ofac-sdn-advanced",
    issued: "2026-10-13",
    sha256: createHash("sha256").update(readFileSync(sample)).digest("hex"),
  });
  expect(stdout).toContain("22 identifiers (6 documents, 15 addresses, 1 features, 0 skipped");
  expect(stdout).toContain(`root ${snapshot.root}`);
});

it("fails with a usage message when no output is given", () => {
  expect(() => execFileSync("node", [cli], { stdio: "pipe" })).toThrow();
});

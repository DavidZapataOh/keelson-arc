import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSnapshot, serializeSnapshot } from "@keelson/lists";
import { expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { startIssuer } from "../src/start.ts";

it("starts from a sanctions snapshot file, serves requests and persists to disk", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keelson-issuer-"));
  const snapshot = join(dir, "sanctions.json");
  const { snapshot: data } = buildSnapshot([5n, 7n], 8, {
    name: "test",
    issued: "2026-01-01",
    sha256: "00",
  });
  writeFileSync(snapshot, serializeSnapshot(data));

  const config = loadConfig({
    ISSUER_PRIVATE_KEY: "07".repeat(32),
    ADMIN_TOKEN: "a".repeat(32),
    REGULATOR_TOKEN: "r".repeat(32),
    SANCTIONS_SNAPSHOT: snapshot,
    DB_PATH: join(dir, "issuer.db"),
    PORT: "0",
  });
  const server = await startIssuer(config);
  const { port } = server.address() as AddressInfo;
  expect((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).ok).toBe(true);
  await new Promise((resolve) => server.close(resolve));
});

it("refuses to start with a tampered sanctions snapshot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keelson-issuer-"));
  const snapshot = join(dir, "sanctions.json");
  const { snapshot: data } = buildSnapshot([5n, 7n], 8, {
    name: "test",
    issued: "2026-01-01",
    sha256: "00",
  });
  writeFileSync(snapshot, serializeSnapshot({ ...data, root: `0x${"1".repeat(64)}` }));

  const config = loadConfig({
    ISSUER_PRIVATE_KEY: "07".repeat(32),
    ADMIN_TOKEN: "a".repeat(32),
    REGULATOR_TOKEN: "r".repeat(32),
    SANCTIONS_SNAPSHOT: snapshot,
    DB_PATH: ":memory:",
  });
  await expect(startIssuer(config)).rejects.toThrow("does not match");
});

it("the entry point refuses to run without configuration", () => {
  const main = new URL("../src/main.ts", import.meta.url).pathname;
  expect(() =>
    execFileSync("node", ["--disable-warning=ExperimentalWarning", main], {
      stdio: "pipe",
      env: {},
    }),
  ).toThrow();
});

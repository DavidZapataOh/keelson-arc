import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const env = {
  ISSUER_PRIVATE_KEY: `0x${"07".repeat(32)}`,
  ADMIN_TOKEN: "a".repeat(32),
  REGULATOR_TOKEN: "r".repeat(32),
  SANCTIONS_SNAPSHOT: "sanctions.json",
};

const DEMO_ENV = {
  DEMO_TIER: "2",
  DEMO_JURISDICTION: "840",
  DEMO_VALIDITY_SECONDS: "604800",
  DEMO_PER_HOUR: "10",
  DEMO_PER_DAY: "500",
};

describe("loadConfig", () => {
  it("applies safe defaults", () => {
    const config = loadConfig(env);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.issuerPrivateKey).toHaveLength(32);
  });

  it("keeps the public extras off by default and validates them", () => {
    const config = loadConfig(env);
    expect(config.allowedOrigins).toEqual([]);
    expect(config.listsDir).toBeUndefined();
    expect(config.demo).toBeUndefined();
    const on = loadConfig({
      ...env,
      ALLOWED_ORIGIN: "https://app.example.org, https://beta.example.org",
      LISTS_DIR: "/data",
      DEMO_MODE: "testnet",
      ...DEMO_ENV,
    });
    expect(on).toMatchObject({
      allowedOrigins: ["https://app.example.org", "https://beta.example.org"],
      listsDir: "/data",
      demo: { tier: 2, jurisdiction: 840, validitySeconds: 604800, perHour: 10, perDay: 500 },
    });
    expect(loadConfig({ ...env, DEMO_MODE: "1" }).demo).toBeUndefined();
    expect(() => loadConfig({ ...env, DEMO_MODE: "testnet" })).toThrow("DEMO_TIER");
    expect(() =>
      loadConfig({ ...env, DEMO_MODE: "testnet", ...DEMO_ENV, DEMO_PER_DAY: "0" }),
    ).toThrow("DEMO_PER_DAY");
    expect(() => loadConfig({ ...env, ALLOWED_ORIGIN: "app.example.org/path" })).toThrow(
      "ALLOWED_ORIGIN",
    );
  });

  it("rejects missing, short, identical or malformed secrets", () => {
    expect(() => loadConfig({ ...env, ISSUER_PRIVATE_KEY: undefined })).toThrow(
      "ISSUER_PRIVATE_KEY is required",
    );
    expect(() => loadConfig({ ...env, ISSUER_PRIVATE_KEY: "0x12" })).toThrow("32 bytes");
    expect(() => loadConfig({ ...env, ADMIN_TOKEN: "short" })).toThrow("at least 32");
    expect(() => loadConfig({ ...env, REGULATOR_TOKEN: env.ADMIN_TOKEN })).toThrow("must differ");
    expect(() => loadConfig({ ...env, SANCTIONS_SNAPSHOT: undefined })).toThrow(
      "SANCTIONS_SNAPSHOT",
    );
    expect(() => loadConfig({ ...env, PORT: "99999" })).toThrow("PORT");
  });
});

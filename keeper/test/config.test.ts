import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const env = {
  RPC_URL: "http://127.0.0.1:8545",
  KEEPER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  SANCTIONS_REGISTRY: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  REVOCATIONS_REGISTRY: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  ISSUER_URL: "https://issuer.example/",
};

describe("loadConfig", () => {
  it("applies defaults and normalizes the issuer URL", () => {
    const config = loadConfig(env);
    expect(config.intervalSeconds).toBe(900);
    expect(config.issuerUrl).toBe("https://issuer.example");
    expect(config.sanctionsSource).toContain("SDN_ADVANCED.XML");
    expect(config.dataDir).toBe("keeper-data");
  });

  it("rejects missing or malformed settings", () => {
    expect(() => loadConfig({ ...env, RPC_URL: undefined })).toThrow("RPC_URL is required");
    expect(() => loadConfig({ ...env, KEEPER_PRIVATE_KEY: "0x12" })).toThrow("32 bytes");
    expect(() => loadConfig({ ...env, SANCTIONS_REGISTRY: "nope" })).toThrow("must be an address");
    expect(() => loadConfig({ ...env, INTERVAL_SECONDS: "5" })).toThrow("INTERVAL_SECONDS");
  });
});

import { describe, expect, it } from "vitest";
import { codeHash, parseDeploymentRecord } from "../src/audit.ts";

const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const record = {
  chainId: "5042",
  rpcUrl: "https://rpc.mainnet.arc.io",
  explorerUrl: "https://explorer.arc.io",
  startBlock: "25900000",
  deployment: {
    verifier: address(1),
    issuers: address(2),
    sanctions: address(3),
    revocations: address(4),
    compliance: address(5),
    settlement: address(6),
  },
  safe: address(7),
  keeper: address(8),
  policy: { minTier: "1", maxProofAge: "3600", attestationTtl: "86400" },
  regulatorKey: { x: "11", y: "12" },
  listMaxAge: "86400",
  grace: "3600",
};

describe("parseDeploymentRecord", () => {
  it("reads a complete record", () => {
    const parsed = parseDeploymentRecord(record);
    expect(parsed.deployment.chainId).toBe(5042);
    expect(parsed.startBlock).toBe(25_900_000n);
    expect(parsed.policy).toEqual({ minTier: 1, maxProofAge: 3600n, attestationTtl: 86400n });
    expect(parsed.regulatorKey).toEqual({ x: 11n, y: 12n });
  });

  it.each([
    [
      "deployment.settlement",
      { ...record, deployment: { ...record.deployment, settlement: "0x12" } },
    ],
    ["safe", { ...record, safe: undefined }],
    ["policy.maxProofAge", { ...record, policy: { ...record.policy, maxProofAge: "-1" } }],
    ["rpcUrl", { ...record, rpcUrl: "" }],
    ["grace", { ...record, grace: 3600 }],
  ])("names the field that is wrong: %s", (name, input) => {
    expect(() => parseDeploymentRecord(input)).toThrow(name);
  });
});

describe("codeHash", () => {
  const code = "0x6001600055";
  const trailer = (hash: string) => `a264697066735822${hash}64736f6c63430008250033`;

  it("ignores the metadata the compiler appends", () => {
    const withA = `${code}${trailer("a".repeat(68))}` as `0x${string}`;
    const withB = `${code}${trailer("b".repeat(68))}` as `0x${string}`;
    expect(codeHash(withA)).toBe(codeHash(withB));
  });

  it("tells different code apart", () => {
    const other = `0x6002600055${trailer("a".repeat(68))}` as `0x${string}`;
    expect(codeHash(other)).not.toBe(
      codeHash(`${code}${trailer("a".repeat(68))}` as `0x${string}`),
    );
  });
});

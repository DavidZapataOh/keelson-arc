import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { decodePackage, encodePackage, PackageError } from "../src/trade/package.ts";
import type { Terms } from "../src/trade/terms.ts";

const terms: Terms = {
  seller: getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8"),
  buyer: getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
  sellToken: "0x3600000000000000000000000000000000000000",
  sellAmount: 25_000_000_000_000n,
  payToken: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
  payAmount: 22_950_000_000_000n,
  expiry: 1_800_003_600n,
};
const pkg = {
  tradeId: 123456789012345678901234567890n,
  terms,
  salt: `0x${"ab".repeat(32)}` as const,
};

describe("trade package", () => {
  it("round-trips and is URL safe", () => {
    const text = encodePackage(pkg);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePackage(text)).toEqual(pkg);
  });

  it("rejects anything tampered, truncated or oversized", () => {
    const text = encodePackage(pkg);
    for (const bad of [text.slice(0, -10), `${text}x`, "", "!!!", "e30", "a".repeat(5000)]) {
      expect(() => decodePackage(bad), bad.slice(0, 12)).toThrow(PackageError);
    }
    const edited = JSON.parse(atob(text.replace(/-/g, "+").replace(/_/g, "/")));
    edited.terms.sellAmount = "0";
    const forged = btoa(JSON.stringify(edited))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodePackage(forged)).toThrow(PackageError);
    edited.terms.sellAmount = "1";
    edited.salt = "0x12";
    expect(() => decodePackage(btoa(JSON.stringify(edited)))).toThrow(PackageError);
  });
});

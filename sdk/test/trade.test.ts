import { describe, expect, it } from "vitest";
import { hashTerms, newSalt, newSecret, newTradeId, type Terms } from "../src/trade.ts";

const terms: Terms = {
  seller: "0x00000000000000000000000000000000000a11ce",
  buyer: "0x0000000000000000000000000000000000000b0b",
  sellToken: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
  sellAmount: 1_000_000_000n,
  payToken: "0x3600000000000000000000000000000000000000",
  payAmount: 1_150_000_000n,
  expiry: 1_800_003_600n,
};

describe("hashTerms", () => {
  it("matches abi.encode and keccak256 as computed independently by Foundry", () => {
    expect(
      hashTerms({
        settlement: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        chainId: 5042,
        tradeId: 1n,
        terms,
        salt: `0x${"11".repeat(32)}`,
      }),
    ).toBe("0x3c95f95785521d65888b509a0406f613515e881ec00425921589468cc00a7250");
  });

  it("changes with every input", () => {
    const base = {
      settlement: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      chainId: 5042,
      tradeId: 1n,
      terms,
      salt: `0x${"11".repeat(32)}`,
    } as const;
    const hashes = new Set([
      hashTerms(base),
      hashTerms({ ...base, chainId: 5043 }),
      hashTerms({ ...base, tradeId: 2n }),
      hashTerms({ ...base, settlement: "0x0000000000000000000000000000000000000001" }),
      hashTerms({ ...base, salt: `0x${"22".repeat(32)}` }),
      hashTerms({ ...base, terms: { ...terms, payAmount: terms.payAmount + 1n } }),
      hashTerms({ ...base, terms: { ...terms, expiry: terms.expiry + 1n } }),
    ]);
    expect(hashes.size).toBe(7);
  });
});

describe("random identifiers", () => {
  it("draws secrets and trade ids below 2^248 that do not repeat", () => {
    const draws = [
      ...Array.from({ length: 32 }, newSecret),
      ...Array.from({ length: 32 }, newTradeId),
    ];
    expect(new Set(draws).size).toBe(64);
    for (const draw of draws) expect(draw).toBeLessThan(1n << 248n);
  });

  it("draws 32-byte salts", () => {
    expect(newSalt()).toMatch(/^0x[0-9a-f]{64}$/);
    expect(newSalt()).not.toBe(newSalt());
  });
});

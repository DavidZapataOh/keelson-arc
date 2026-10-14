import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  formatAmount,
  MAX_EXPIRY_SECONDS,
  parseAmount,
  parseTerms,
  type Terms,
  TermsError,
  validateTerms,
} from "../src/trade/terms.ts";

const A = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const B = getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");
const USDC = {
  address: "0x3600000000000000000000000000000000000000",
  symbol: "USDC",
  decimals: 6,
} as const;
const EURC = {
  address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
  symbol: "EURC",
  decimals: 6,
} as const;
const NOW = 1_800_000_000;

const base: Terms = {
  seller: A,
  buyer: B,
  sellToken: USDC.address,
  sellAmount: 25_000_000_000_000n,
  payToken: EURC.address,
  payAmount: 22_950_000_000_000n,
  expiry: BigInt(NOW + 3600),
};

const field = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof TermsError) return error.field;
    throw error;
  }
  return "none";
};

describe("amounts", () => {
  it("round-trips zero, one unit, 18 decimals and values beyond 2^53", () => {
    for (const [text, decimals] of [
      ["0", 6],
      ["0.000001", 6],
      ["1", 18],
      ["0.000000000000000001", 18],
      ["9007199254740993.123456", 6],
      ["25,000,000", 6],
    ] as const) {
      const value = parseAmount(text, decimals);
      expect(parseAmount(formatAmount(value, decimals), decimals)).toBe(value);
    }
    expect(parseAmount("9007199254740993.123456", 6)).toBe(9007199254740993123456n);
    expect(formatAmount(25_000_000_000_000n, 6)).toBe("25,000,000");
    expect(formatAmount(1n, 6)).toBe("0.000001");
    expect(formatAmount(0n, 6)).toBe("0");
  });

  it("refuses text that is not an exact amount", () => {
    for (const bad of ["", "-1", "1e6", "1.5.2", "abc", "0.0000001"]) {
      expect(() => parseAmount(bad, 6), bad).toThrow(TermsError);
    }
  });
});

describe("terms", () => {
  it("accepts good terms and checksums the addresses", () => {
    const terms = validateTerms(
      { ...base, seller: A.toLowerCase() as `0x${string}` },
      { now: NOW, requireFuture: true },
    );
    expect(terms.seller).toBe(A);
  });

  it("rejects each broken rule on its field", () => {
    const check = (patch: Partial<Terms>, requireFuture = true) =>
      field(() => validateTerms({ ...base, ...patch }, { now: NOW, requireFuture }));
    expect(check({ seller: "0x12" })).toBe("seller");
    expect(check({ buyer: "0x0000000000000000000000000000000000000000" })).toBe("buyer");
    expect(check({ buyer: A })).toBe("buyer");
    expect(check({ payToken: USDC.address })).toBe("payToken");
    expect(check({ sellAmount: 0n })).toBe("sellAmount");
    expect(check({ payAmount: 0n })).toBe("payAmount");
    expect(check({ expiry: BigInt(NOW) })).toBe("expiry");
    expect(check({ expiry: BigInt(NOW + MAX_EXPIRY_SECONDS + 1) })).toBe("expiry");
    expect(check({ expiry: 2n ** 64n })).toBe("expiry");
    expect(check({ expiry: BigInt(NOW - 10) }, false)).toBe("none");
  });

  it("parses the form and uses each token's own decimals", () => {
    const terms = parseTerms(
      {
        seller: A,
        buyer: B,
        sellToken: USDC.address,
        sellAmount: "25,000,000",
        payToken: EURC.address,
        payAmount: "22950000.5",
        expiry: NOW + 7200,
      },
      [USDC, EURC],
      NOW,
    );
    expect(terms.sellAmount).toBe(25_000_000_000_000n);
    expect(terms.payAmount).toBe(22_950_000_500_000n);
    expect(
      field(() =>
        parseTerms(
          {
            seller: A,
            buyer: B,
            sellToken: USDC.address,
            sellAmount: "1.0000001",
            payToken: EURC.address,
            payAmount: "1",
            expiry: NOW + 60,
          },
          [USDC, EURC],
          NOW,
        ),
      ),
    ).toBe("sellAmount");
    expect(
      field(() =>
        parseTerms(
          {
            seller: A,
            buyer: B,
            sellToken: "0x1111111111111111111111111111111111111111",
            sellAmount: "1",
            payToken: EURC.address,
            payAmount: "1",
            expiry: NOW + 60,
          },
          [USDC, EURC],
          NOW,
        ),
      ),
    ).toBe("sellToken");
  });
});

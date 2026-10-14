import { describe, expect, it } from "vitest";
import {
  identifierHash,
  MIN_ID_LENGTH,
  normalizeAddress,
  normalizeId,
} from "../src/identifiers.ts";

describe("normalization", () => {
  it("makes registry numbers comparable regardless of punctuation, spacing and case", () => {
    expect(normalizeId(" ab-12 3/4.5 ")).toBe("AB12345");
    expect(normalizeId("ＡＢ１２３４５")).toBe("AB12345");
  });

  it("lowercases EVM addresses and leaves other chains' addresses untouched", () => {
    expect(normalizeAddress("0x1CAb8177ACe78b1B6B1c393371F4f2dCAE40CbEB")).toBe(
      "0x1cab8177ace78b1b6b1c393371f4f2dcae40cbeb",
    );
    expect(normalizeAddress(" 12aNKp2iDKuhEde2YfPdd4DFGenRUTKupL ")).toBe(
      "12aNKp2iDKuhEde2YfPdd4DFGenRUTKupL",
    );
  });
});

describe("identifierHash", () => {
  it("matches an independently computed keccak-256 truncated to 248 bits", () => {
    // keccak256("keelson.sanctions.v1:address:0x252a8bd2319d8a555b872990601221b3a2053bce") >> 8
    expect(
      identifierHash({ kind: "address", value: "0x252A8BD2319D8A555B872990601221B3A2053BCE" }),
    ).toBe(0xd87af20997f738c74a25b15253fec404d23e69e1579a15464fccbbc642c52de6n >> 8n);
    // keccak256("keelson.sanctions.v1:id:040070827") >> 8
    expect(identifierHash({ kind: "id", value: "040-070.827" })).toBe(
      0xa39b409618d2db1f3523d2e28348984b6eb4493ac4f2e3a5dfcef92a5f9dc032n >> 8n,
    );
  });

  it("always lies in the range the circuit accepts", () => {
    const hash = identifierHash({ kind: "id", value: "ABC12345" }) as bigint;
    expect(hash).toBeGreaterThan(0n);
    expect(hash).toBeLessThan(1n << 248n);
  });

  it("separates kinds so a registry number never collides with an address", () => {
    const value = "ABCDEF123456";
    expect(identifierHash({ kind: "id", value })).not.toBe(
      identifierHash({ kind: "address", value }),
    );
  });

  it("refuses identifiers too short to screen on", () => {
    expect(identifierHash({ kind: "id", value: "1".repeat(MIN_ID_LENGTH - 1) })).toBeUndefined();
    expect(identifierHash({ kind: "id", value: "1".repeat(MIN_ID_LENGTH) })).toBeDefined();
    expect(identifierHash({ kind: "id", value: " - / " })).toBeUndefined();
    expect(identifierHash({ kind: "address", value: "  " })).toBeUndefined();
  });
});

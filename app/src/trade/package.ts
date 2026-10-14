import { type Address, type Hex, isHex } from "viem";
import { type Terms, TermsError, validateTerms } from "./terms.ts";

/** What only the two parties hold: the trade id, the terms and the salt that hides them on chain. */
export type TradePackage = { tradeId: bigint; terms: Terms; salt: Hex };

export class PackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageError";
  }
}

const MAX_TRADE_ID = 2n ** 248n;
const MAX_FRAGMENT = 4096;

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (fragment: string) => {
  const binary = atob(fragment.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

export function encodePackage(pkg: TradePackage): string {
  const { terms } = pkg;
  return toBase64Url(
    JSON.stringify({
      v: 1,
      tradeId: pkg.tradeId.toString(),
      salt: pkg.salt,
      terms: {
        seller: terms.seller,
        buyer: terms.buyer,
        sellToken: terms.sellToken,
        sellAmount: terms.sellAmount.toString(),
        payToken: terms.payToken,
        payAmount: terms.payAmount.toString(),
        expiry: terms.expiry.toString(),
      },
    }),
  );
}

const decimal = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) throw new PackageError("bad number");
  return BigInt(value);
};

export function decodePackage(fragment: string): TradePackage {
  try {
    if (fragment.length === 0 || fragment.length > MAX_FRAGMENT) throw new PackageError("size");
    const body = JSON.parse(fromBase64Url(fragment)) as Record<string, unknown>;
    if (body.v !== 1) throw new PackageError("version");
    const raw = body.terms as Record<string, unknown>;
    const tradeId = decimal(body.tradeId);
    if (tradeId <= 0n || tradeId >= MAX_TRADE_ID) throw new PackageError("trade id");
    if (typeof body.salt !== "string" || !isHex(body.salt) || body.salt.length !== 66) {
      throw new PackageError("salt");
    }
    const terms = validateTerms(
      {
        seller: raw.seller as Address,
        buyer: raw.buyer as Address,
        sellToken: raw.sellToken as Address,
        sellAmount: decimal(raw.sellAmount),
        payToken: raw.payToken as Address,
        payAmount: decimal(raw.payAmount),
        expiry: decimal(raw.expiry),
      },
      { now: 0, requireFuture: false },
    );
    return { tradeId, terms, salt: body.salt };
  } catch (error) {
    if (error instanceof PackageError || error instanceof TermsError) {
      throw new PackageError("This is not a valid trade link.");
    }
    throw new PackageError("This is not a valid trade link.");
  }
}

import type { Terms } from "@keelson/sdk/trade";
import { type Address, getAddress, isAddress, isAddressEqual, zeroAddress } from "viem";

export type { Terms };

export type Token = { address: Address; symbol: string; decimals: number };

export const MAX_EXPIRY_SECONDS = 7 * 24 * 3600;

export class TermsError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "TermsError";
    this.field = field;
  }
}

/** Reads a decimal amount exactly; never goes through floating point. */
export function parseAmount(text: string, decimals: number): bigint {
  const trimmed = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new TermsError("amount", "Enter a positive amount.");
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new TermsError("amount", `This token has ${decimals} decimals at most.`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

export function formatAmount(value: bigint, decimals: number): string {
  const digits = value.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

type Options = { now: number; requireFuture: boolean };

const wellFormed = (field: string, value: string): Address => {
  if (!isAddress(value, { strict: false }) || isAddressEqual(value as Address, zeroAddress)) {
    throw new TermsError(field, "Enter a valid, non-zero address.");
  }
  return getAddress(value);
};

export function validateTerms(terms: Terms, { now, requireFuture }: Options): Terms {
  const seller = wellFormed("seller", terms.seller);
  const buyer = wellFormed("buyer", terms.buyer);
  const sellToken = wellFormed("sellToken", terms.sellToken);
  const payToken = wellFormed("payToken", terms.payToken);
  if (isAddressEqual(seller, buyer)) {
    throw new TermsError("buyer", "The two parties must be different addresses.");
  }
  if (isAddressEqual(sellToken, payToken)) {
    throw new TermsError("payToken", "The two tokens must be different.");
  }
  if (terms.sellAmount <= 0n) throw new TermsError("sellAmount", "The amount must be positive.");
  if (terms.payAmount <= 0n) throw new TermsError("payAmount", "The amount must be positive.");
  if (terms.expiry <= 0n || terms.expiry >= 2n ** 64n) {
    throw new TermsError("expiry", "The expiry is not a valid time.");
  }
  if (requireFuture) {
    if (terms.expiry <= BigInt(now))
      throw new TermsError("expiry", "The expiry must be in the future.");
    if (terms.expiry > BigInt(now + MAX_EXPIRY_SECONDS)) {
      throw new TermsError("expiry", "The expiry can be at most 7 days away.");
    }
  }
  return {
    seller,
    buyer,
    sellToken,
    sellAmount: terms.sellAmount,
    payToken,
    payAmount: terms.payAmount,
    expiry: terms.expiry,
  };
}

export type TermsInput = {
  seller: string;
  buyer: string;
  sellToken: string;
  sellAmount: string;
  payToken: string;
  payAmount: string;
  expiry: number;
};

export function parseTerms(input: TermsInput, tokens: Token[], now: number): Terms {
  const decimalsOf = (field: string, address: string) => {
    const token = tokens.find(
      (t) => isAddress(address, { strict: false }) && isAddressEqual(t.address, address as Address),
    );
    if (!token) throw new TermsError(field, "Choose a token.");
    return token.decimals;
  };
  const amount = (field: string, text: string, decimals: number) => {
    try {
      return parseAmount(text, decimals);
    } catch (error) {
      throw new TermsError(field, (error as Error).message);
    }
  };
  return validateTerms(
    {
      seller: input.seller as Address,
      buyer: input.buyer as Address,
      sellToken: input.sellToken as Address,
      sellAmount: amount("sellAmount", input.sellAmount, decimalsOf("sellToken", input.sellToken)),
      payToken: input.payToken as Address,
      payAmount: amount("payAmount", input.payAmount, decimalsOf("payToken", input.payToken)),
      expiry: BigInt(input.expiry),
    },
    { now, requireFuture: true },
  );
}

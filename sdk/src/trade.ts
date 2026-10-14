import { type Address, encodeAbiParameters, type Hex, keccak256, toHex } from "viem";
import { random248, randomBytes } from "./random.ts";

export type Terms = {
  seller: Address;
  buyer: Address;
  sellToken: Address;
  sellAmount: bigint;
  payToken: Address;
  payAmount: bigint;
  expiry: bigint;
};

const TERMS_COMPONENTS = [
  { name: "seller", type: "address" },
  { name: "buyer", type: "address" },
  { name: "sellToken", type: "address" },
  { name: "sellAmount", type: "uint256" },
  { name: "payToken", type: "address" },
  { name: "payAmount", type: "uint256" },
  { name: "expiry", type: "uint64" },
] as const;

/** The commitment `Settlement.hashTerms` computes: bound to the contract, the chain and the trade. */
export const hashTerms = (args: {
  settlement: Address;
  chainId: number;
  tradeId: bigint;
  terms: Terms;
  salt: Hex;
}): Hex =>
  keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "tuple", components: TERMS_COMPONENTS },
        { type: "bytes32" },
      ],
      [args.settlement, BigInt(args.chainId), args.tradeId, args.terms, args.salt],
    ),
  );

/** A fresh trade id: a random 248-bit value, so it is a valid circuit input. */
export const newTradeId = (): bigint => random248();

/** A fresh holder secret: a random 248-bit value, below the field modulus. */
export const newSecret = (): bigint => random248();

export const newSalt = (): Hex => toHex(randomBytes(32));

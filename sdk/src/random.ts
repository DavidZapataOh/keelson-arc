import { bytesToBigInt } from "viem";

/** Bytes from the platform CSPRNG (Node and browsers). */
export const randomBytes = (length: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

/** Uniform random integer below 2^248. */
export const random248 = (): bigint => bytesToBigInt(randomBytes(31));

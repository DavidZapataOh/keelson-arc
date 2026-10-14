import { keccak256, toBytes } from "viem";

const DOMAIN = "keelson.sanctions.v1";

/** Government and registry numbers shorter than this are too ambiguous to screen against. */
export const MIN_ID_LENGTH = 5;

export type Identifier = { kind: "id"; value: string } | { kind: "address"; value: string };

export const normalizeId = (value: string): string =>
  value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

export const normalizeAddress = (value: string): string => {
  const trimmed = value.normalize("NFKC").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
};

/**
 * Maps an identifier to the 248-bit value stored in the sanctions set and signed into credentials.
 * Returns undefined for identifiers that are empty or too short to screen on.
 */
export const identifierHash = (identifier: Identifier): bigint | undefined => {
  const normalized =
    identifier.kind === "id" ? normalizeId(identifier.value) : normalizeAddress(identifier.value);
  if (identifier.kind === "id" ? normalized.length < MIN_ID_LENGTH : normalized.length === 0) {
    return undefined;
  }
  return BigInt(keccak256(toBytes(`${DOMAIN}:${identifier.kind}:${normalized}`))) >> 8n;
};

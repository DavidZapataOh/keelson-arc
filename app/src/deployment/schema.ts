import type { Address } from "viem";
import { isAddress } from "viem";

export type DeploymentToken = { address: Address; symbol: string; decimals: number };

export type DeploymentFile = {
  chainId: number;
  verifier: Address;
  issuers: Address;
  sanctions: Address;
  revocations: Address;
  compliance: Address;
  settlement: Address;
  rpcUrl: string;
  issuerUrl: string;
  listsUrl: string;
  assetsUrl: string;
  tokens?: DeploymentToken[];
};

export type DeploymentFailure =
  | "unreachable"
  | "invalid-file"
  | "wrong-chain"
  | "no-code"
  | "wrong-link";

export class DeploymentError extends Error {
  readonly code: DeploymentFailure;

  constructor(code: DeploymentFailure, message: string) {
    super(message);
    this.name = "DeploymentError";
    this.code = code;
  }
}

const ADDRESS_KEYS = [
  "verifier",
  "issuers",
  "sanctions",
  "revocations",
  "compliance",
  "settlement",
] as const;
const URL_KEYS = ["rpcUrl", "issuerUrl", "listsUrl", "assetsUrl"] as const;
const KEYS = new Set<string>(["chainId", "tokens", ...ADDRESS_KEYS, ...URL_KEYS]);

const isLocal = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1";

function checkUrl(key: string, value: unknown): string {
  if (typeof value !== "string") throw new DeploymentError("invalid-file", `${key} must be a URL`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DeploymentError("invalid-file", `${key} is not a valid URL`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal(url))) {
    throw new DeploymentError("invalid-file", `${key} must use https`);
  }
  return value.replace(/\/+$/, "");
}

function checkTokens(value: unknown): DeploymentToken[] {
  if (!Array.isArray(value) || value.length > 16) {
    throw new DeploymentError("invalid-file", "tokens must be a short list");
  }
  return value.map((item, i) => {
    const t = item as Partial<DeploymentToken> | null;
    if (
      !t ||
      typeof t.address !== "string" ||
      !isAddress(t.address, { strict: false }) ||
      typeof t.symbol !== "string" ||
      t.symbol.length === 0 ||
      t.symbol.length > 12 ||
      !Number.isInteger(t.decimals) ||
      (t.decimals as number) < 0 ||
      (t.decimals as number) > 36
    ) {
      throw new DeploymentError("invalid-file", `tokens[${i}] is not a valid token`);
    }
    return { address: t.address, symbol: t.symbol, decimals: t.decimals as number };
  });
}

export function parseDeploymentFile(input: unknown): DeploymentFile {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new DeploymentError("invalid-file", "the deployment file must be an object");
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!KEYS.has(key)) throw new DeploymentError("invalid-file", `unknown field ${key}`);
  }
  if (!Number.isSafeInteger(record.chainId)) {
    throw new DeploymentError("invalid-file", "chainId must be an integer");
  }
  const out: Record<string, unknown> = { chainId: record.chainId };
  for (const key of ADDRESS_KEYS) {
    const value = record[key];
    if (typeof value !== "string" || !isAddress(value, { strict: false })) {
      throw new DeploymentError("invalid-file", `${key} must be an address`);
    }
    out[key] = value;
  }
  for (const key of URL_KEYS) out[key] = checkUrl(key, record[key]);
  if (record.tokens !== undefined) out.tokens = checkTokens(record.tokens);
  return out as DeploymentFile;
}

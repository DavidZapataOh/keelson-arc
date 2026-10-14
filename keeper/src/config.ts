import { OFAC_ADVANCED_URL } from "@keelson/lists";
import type { Address, Hex } from "viem";

export type Config = {
  rpcUrl: string;
  privateKey: Hex;
  sanctionsRegistry: Address;
  revocationsRegistry: Address;
  sanctionsSource: string;
  issuerUrl: string;
  dataDir: string;
  intervalSeconds: number;
};

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const address = (env: NodeJS.ProcessEnv, name: string): Address => {
  const value = required(env, name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be an address`);
  return value as Address;
};

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const key = required(env, "KEEPER_PRIVATE_KEY").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error("KEEPER_PRIVATE_KEY must be 32 bytes of hex");

  const intervalSeconds = Number(env.INTERVAL_SECONDS ?? "900");
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 10) {
    throw new Error("INTERVAL_SECONDS must be an integer of at least 10");
  }
  return {
    rpcUrl: required(env, "RPC_URL"),
    privateKey: `0x${key}`,
    sanctionsRegistry: address(env, "SANCTIONS_REGISTRY"),
    revocationsRegistry: address(env, "REVOCATIONS_REGISTRY"),
    sanctionsSource: env.SANCTIONS_SOURCE ?? OFAC_ADVANCED_URL,
    issuerUrl: required(env, "ISSUER_URL").replace(/\/$/, ""),
    dataDir: env.DATA_DIR ?? "keeper-data",
    intervalSeconds,
  };
}

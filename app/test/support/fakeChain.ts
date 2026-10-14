import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import {
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  type PublicClient,
} from "viem";
import { arc } from "viem/chains";
import type { DeploymentFile } from "../../src/deployment/schema.ts";

export const ADDRESSES = {
  verifier: "0x1000000000000000000000000000000000000001",
  issuers: "0x1000000000000000000000000000000000000002",
  sanctions: "0x1000000000000000000000000000000000000003",
  revocations: "0x1000000000000000000000000000000000000004",
  compliance: "0x1000000000000000000000000000000000000005",
  settlement: "0x1000000000000000000000000000000000000006",
} as const satisfies Record<string, Address>;

export const FILE: DeploymentFile = {
  chainId: arc.id,
  ...ADDRESSES,
  rpcUrl: "https://rpc.example.org",
  issuerUrl: "https://issuer.example.org",
  listsUrl: "https://lists.example.org",
  assetsUrl: "https://app.example.org/circuit",
};

type Overrides = {
  chainId?: number;
  empty?: Address[];
  links?: Partial<
    Record<"verifier" | "issuers" | "sanctions" | "revocations" | "compliance", Address>
  >;
};

const word = (address: Address): Hex => encodeAbiParameters([{ type: "address" }], [address]);

/** Answers JSON-RPC requests like a deployed system, for tests of the loader and the shell only. */
export function answer(method: string, args: unknown[], overrides: Overrides = {}): unknown {
  const links = { ...ADDRESSES, ...overrides.links };
  if (method === "eth_chainId") return `0x${(overrides.chainId ?? arc.id).toString(16)}`;
  if (method === "eth_getCode") {
    const address = (args[0] as string).toLowerCase();
    return overrides.empty?.some((a) => a.toLowerCase() === address) ? "0x" : "0x6001";
  }
  if (method === "eth_call") {
    const { to, data } = args[0] as { to: Address; data: Hex };
    const target = to.toLowerCase();
    if (target === ADDRESSES.compliance.toLowerCase()) {
      const { functionName } = decodeFunctionData({ abi: complianceRegistryAbi, data });
      return word(links[functionName as "verifier" | "issuers" | "sanctions" | "revocations"]);
    }
    if (target === ADDRESSES.settlement.toLowerCase()) {
      const { functionName } = decodeFunctionData({ abi: settlementAbi, data });
      if (functionName === "compliance") return word(links.compliance);
    }
  }
  throw new Error(`unexpected request ${method}`);
}

export function fakeChain(overrides: Overrides = {}): PublicClient {
  const request = async ({ method, params }: { method: string; params?: unknown }) =>
    answer(method, params as unknown[], overrides);
  return createPublicClient({ chain: arc, transport: custom({ request }) });
}

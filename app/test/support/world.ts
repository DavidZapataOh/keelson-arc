import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import { arc } from "@keelson/sdk/arc";
import {
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  erc20Abi,
  type Hex,
  type PublicClient,
  zeroHash,
} from "viem";
import { ADDRESSES } from "./fakeChain.ts";

/** The part of a deployed system the trade room reads, held in memory and changed by the test. */
export type World = {
  timestamp: number;
  settled: boolean;
  compliant: Set<string>;
  commitments: Map<string, Hex>;
  allowance: Map<string, bigint>;
  balance: Map<string, bigint>;
};

export const newWorld = (timestamp = 1_800_000_000): World => ({
  timestamp,
  settled: false,
  compliant: new Set(),
  commitments: new Map(),
  allowance: new Map(),
  balance: new Map(),
});

const key = (...parts: string[]) => parts.map((p) => p.toLowerCase()).join(":");
export const allowanceKey = (token: Address, owner: Address) => key(token, owner);
export const balanceKey = (token: Address, owner: Address) => key(token, owner);

const word = (type: "bool" | "bytes32" | "uint256", value: unknown): Hex =>
  encodeAbiParameters([{ type }], [value as never]);

function block(world: World) {
  const zero = zeroHash;
  return {
    number: "0x1",
    hash: zero,
    parentHash: zero,
    timestamp: `0x${world.timestamp.toString(16)}`,
    nonce: "0x0000000000000000",
    sha3Uncles: zero,
    logsBloom: `0x${"0".repeat(512)}`,
    transactionsRoot: zero,
    stateRoot: zero,
    receiptsRoot: zero,
    miner: "0x0000000000000000000000000000000000000000",
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x1",
    gasLimit: "0x1",
    gasUsed: "0x0",
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x1",
  };
}

/** Answers one JSON-RPC request from the world, for the client below and for browser tests. */
export function answerWorld(world: World, method: string, args: unknown[]): unknown {
  {
    if (method === "eth_chainId") return `0x${arc.id.toString(16)}`;
    if (method === "eth_getBlockByNumber") return block(world);
    if (method === "eth_blockNumber") return "0x10";
    if (method === "eth_maxPriorityFeePerGas") return "0x1";
    if (method === "eth_getTransactionReceipt") {
      return {
        status: "0x1",
        transactionHash: `0x${"1".padStart(64, "0")}`,
        transactionIndex: "0x0",
        blockHash: zeroHash,
        blockNumber: "0x10",
        from: "0x0000000000000000000000000000000000000001",
        to: "0x0000000000000000000000000000000000000002",
        cumulativeGasUsed: "0x1",
        gasUsed: "0x1",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"0".repeat(512)}`,
        type: "0x2",
        effectiveGasPrice: "0x1",
      };
    }
    if (method !== "eth_call") throw new Error(`unexpected ${method}`);
    const { to, data } = args[0] as { to: Address; data: Hex };
    const target = to.toLowerCase();
    if (target === ADDRESSES.compliance.toLowerCase()) {
      const call = decodeFunctionData({ abi: complianceRegistryAbi, data });
      if (call.functionName === "policy") {
        return encodeAbiParameters(
          [{ type: "uint8" }, { type: "uint64" }, { type: "uint64" }],
          [2, 3600n, 7200n],
        );
      }
      if (call.functionName === "regulatorKeyX" || call.functionName === "regulatorKeyY") {
        return word("uint256", 5n);
      }
      if (call.functionName === "isCompliant") {
        const [, party] = call.args as [bigint, Address];
        return word("bool", world.compliant.has(key(party)));
      }
      return "0x";
    }
    for (const name of ["issuers", "sanctions", "revocations"] as const) {
      if (target === ADDRESSES[name].toLowerCase()) {
        return encodeAbiParameters([{ type: "uint64" }], [1n]);
      }
    }
    if (target === ADDRESSES.settlement.toLowerCase()) {
      const call = decodeFunctionData({ abi: settlementAbi, data });
      if (call.functionName === "commitments") {
        const [, party] = call.args as [bigint, Address];
        return word("bytes32", world.commitments.get(key(party)) ?? zeroHash);
      }
      if (call.functionName === "settled") return word("bool", world.settled);
      return "0x";
    }
    const token = decodeFunctionData({ abi: erc20Abi, data });
    if (token.functionName === "allowance") {
      const [owner] = token.args as [Address, Address];
      return word("uint256", world.allowance.get(allowanceKey(to, owner)) ?? 0n);
    }
    if (token.functionName === "balanceOf") {
      const [owner] = token.args as [Address];
      return word("uint256", world.balance.get(balanceKey(to, owner)) ?? 0n);
    }
    return "0x";
  }
}

export function worldClient(world: World): PublicClient {
  const request = async ({ method, params }: { method: string; params?: unknown }) =>
    answerWorld(world, method, (params ?? []) as unknown[]);
  return createPublicClient({ chain: arc, transport: custom({ request }) });
}

export const partyKey = (party: Address) => key(party);

import { arc } from "@keelson/sdk/arc";
import { createPublicClient, custom, type Hex, type PublicClient, zeroHash } from "viem";
import type { Chain } from "../../src/state/context.tsx";
import { FILE } from "./fakeChain.ts";

type Behaviour = { revertData?: Hex; receiptStatus?: "0x1" | "0x0" };

/** A node for send tests: it simulates calls (optionally reverting with data) and mines whatever is sent. */
export function sendChain(behaviour: Behaviour = {}): Chain {
  const request = async ({ method }: { method: string; params?: unknown }) => {
    switch (method) {
      case "eth_chainId":
        return `0x${arc.id.toString(16)}`;
      case "eth_blockNumber":
        return "0x10";
      case "eth_getBlockByNumber":
        return {
          number: "0x10",
          hash: zeroHash,
          parentHash: zeroHash,
          timestamp: "0x6b49d200",
          nonce: "0x0000000000000000",
          sha3Uncles: zeroHash,
          logsBloom: `0x${"0".repeat(512)}`,
          transactionsRoot: zeroHash,
          stateRoot: zeroHash,
          receiptsRoot: zeroHash,
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
      case "eth_maxPriorityFeePerGas":
        return "0x1";
      case "eth_call":
        if (behaviour.revertData) {
          throw Object.assign(new Error("execution reverted"), {
            code: 3,
            data: behaviour.revertData,
          });
        }
        return "0x";
      case "eth_getTransactionReceipt":
        return {
          status: behaviour.receiptStatus ?? "0x1",
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
      default:
        throw new Error(`unexpected ${method}`);
    }
  };
  const client = createPublicClient({ chain: arc, transport: custom({ request }) }) as PublicClient;
  return { file: FILE, client };
}

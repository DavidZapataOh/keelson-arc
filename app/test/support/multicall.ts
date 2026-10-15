import { decodeFunctionData, encodeFunctionResult, type Hex, multicall3Abi } from "viem";

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

type Call = { to: string; data: Hex };

/**
 * Answers an `eth_call` to Multicall3 by answering each batched call with `single`, the way a node would,
 * so a fake endpoint keeps working when the client batches reads.
 */
export function answerBatched(
  method: string,
  params: unknown[],
  single: (method: string, params: unknown[]) => unknown,
): unknown {
  if (method === "eth_call") {
    const call = params[0] as Call;
    if (call.to.toLowerCase() === MULTICALL3) {
      const { functionName, args } = decodeFunctionData({ abi: multicall3Abi, data: call.data });
      if (functionName === "aggregate3") {
        const calls = (args?.[0] ?? []) as readonly { target: string; callData: Hex }[];
        return encodeFunctionResult({
          abi: multicall3Abi,
          functionName: "aggregate3",
          result: calls.map((item) => {
            try {
              const returnData = single("eth_call", [
                { to: item.target, data: item.callData },
                ...params.slice(1),
              ]) as Hex;
              return { success: true, returnData };
            } catch {
              return { success: false, returnData: "0x" as Hex };
            }
          }),
        });
      }
    }
  }
  return single(method, params);
}

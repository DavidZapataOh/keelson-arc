import type { PublicClient } from "viem";

/** Arc's mempool silently drops transactions that bid less than this per gas. */
export const MIN_FEE_PER_GAS = 20_000_000_000n;

/** Fee fields for a transaction that is never below Arc's 20 gwei floor. */
export async function feeParams(client: PublicClient) {
  const estimate = await client.estimateFeesPerGas();
  const maxFeePerGas =
    estimate.maxFeePerGas > MIN_FEE_PER_GAS ? estimate.maxFeePerGas : MIN_FEE_PER_GAS;
  return { maxFeePerGas, maxPriorityFeePerGas: estimate.maxPriorityFeePerGas ?? 0n };
}

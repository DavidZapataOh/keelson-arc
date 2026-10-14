import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { feeParams, MIN_FEE_PER_GAS } from "../src/fees.ts";

const client = (maxFeePerGas: bigint, maxPriorityFeePerGas?: bigint) =>
  ({
    estimateFeesPerGas: async () => ({ maxFeePerGas, maxPriorityFeePerGas }),
  }) as unknown as PublicClient;

describe("feeParams", () => {
  it("never bids below Arc's 20 gwei floor", async () => {
    expect((await feeParams(client(1_000_000_000n))).maxFeePerGas).toBe(MIN_FEE_PER_GAS);
    expect((await feeParams(client(MIN_FEE_PER_GAS - 1n))).maxFeePerGas).toBe(MIN_FEE_PER_GAS);
  });

  it("keeps a higher estimate and the node's priority fee", async () => {
    expect(await feeParams(client(35_000_000_000n, 2_000_000_000n))).toEqual({
      maxFeePerGas: 35_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
    });
  });

  it("defaults a missing priority fee to zero, which Arc accepts", async () => {
    expect((await feeParams(client(25_000_000_000n))).maxPriorityFeePerGas).toBe(0n);
  });
});

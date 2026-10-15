import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import type { Terms } from "@keelson/sdk/trade";
import { type Address, encodeFunctionData, erc20Abi, type Hex } from "viem";
import type { Call } from "../export/transaction.ts";
import type { ProveResult } from "../prove/types.ts";

type Signals = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
];

export const attestCall = (compliance: Address, proof: ProveResult): Call => ({
  to: compliance,
  data: encodeFunctionData({
    abi: complianceRegistryAbi,
    functionName: "attest",
    args: [
      proof.calldata.a,
      proof.calldata.b,
      proof.calldata.c,
      proof.signals as unknown as Signals,
    ],
  }),
});

/** Approves exactly the amount of the trade, never an unlimited allowance. */
export const approveCall = (token: Address, spender: Address, amount: bigint): Call => ({
  to: token,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
});

export const commitCall = (settlement: Address, tradeId: bigint, termsHash: Hex): Call => ({
  to: settlement,
  data: encodeFunctionData({
    abi: settlementAbi,
    functionName: "commit",
    args: [tradeId, termsHash],
  }),
});

export const settleCall = (
  settlement: Address,
  tradeId: bigint,
  terms: Terms,
  salt: Hex,
): Call => ({
  to: settlement,
  data: encodeFunctionData({
    abi: settlementAbi,
    functionName: "settle",
    args: [tradeId, terms, salt],
  }),
});

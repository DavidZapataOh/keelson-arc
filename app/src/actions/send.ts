import { feeParams } from "@keelson/sdk/fees";
import type { Hex } from "viem";
import { ARC as arc } from "../chain.ts";
import type { Call } from "../export/transaction.ts";
import type { Chain } from "../state/context.tsx";
import { assertArc, type Session, WrongChainError } from "../wallet/session.ts";
import { explain } from "./errors.ts";

export type SendResult =
  | { status: "sent"; hash: Hex }
  | { status: "rejected" }
  | { status: "failed"; message: string };

/** Checks the call against the chain first so a revert is explained in words, then sends it and waits for the receipt. */
export async function sendCall(chain: Chain, session: Session, call: Call): Promise<SendResult> {
  const wallet = session.walletClient;
  if (!wallet || session.kind !== "wallet") {
    return {
      status: "failed",
      message: "This is a read-only session. Export the transaction instead.",
    };
  }
  try {
    assertArc(session);
  } catch (error) {
    if (error instanceof WrongChainError) {
      return { status: "failed", message: "Switch your wallet to Arc first." };
    }
    throw error;
  }
  const account = session.snapshot.address;
  try {
    await chain.client.call({ account, to: call.to, data: call.data });
  } catch (error) {
    const result = explain(error);
    if (result.kind === "reverted") return { status: "failed", message: result.message };
  }
  try {
    const hash = await wallet.sendTransaction({
      account,
      chain: arc,
      to: call.to,
      data: call.data,
      value: call.value ?? 0n,
      ...(await feeParams(chain.client)),
    });
    const receipt = await chain.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return {
        status: "failed",
        message: "The transaction was mined but reverted. Nothing moved.",
      };
    }
    return { status: "sent", hash };
  } catch (error) {
    const result = explain(error);
    if (result.kind === "rejected") return { status: "rejected" };
    return { status: "failed", message: result.kind === "other" ? result.message : result.message };
  }
}

import type { Hash, PublicClient, WalletClient } from "viem";
import { feeParams } from "./fees.ts";

type Fees = Awaited<ReturnType<typeof feeParams>>;

/** Sends a transaction with Arc-safe fees, waits for its receipt and fails if it reverted. */
export async function submit(
  publicClient: PublicClient,
  walletClient: WalletClient | undefined,
  write: (wallet: WalletClient, fees: Fees) => Promise<Hash>,
): Promise<Hash> {
  if (!walletClient?.account) {
    throw new Error("a wallet client with an account is required to send transactions");
  }
  const hash = await write(walletClient, await feeParams(publicClient));
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return hash;
}

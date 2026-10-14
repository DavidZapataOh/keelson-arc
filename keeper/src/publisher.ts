import { feeParams, rootRegistryAbi } from "@keelson/sdk";
import type { Account, Address, Hash, PublicClient, WalletClient } from "viem";
import { type Action, decide } from "./decide.ts";

export type RootSyncer = { sync(root: bigint): Promise<{ action: Action; hash?: Hash }> };

/** Keeps one `RootRegistry` in step with the root of a snapshot. The wallet account must own the registry. */
export class RootPublisher implements RootSyncer {
  private readonly publicClient: PublicClient;
  private readonly wallet: WalletClient;
  readonly registry: Address;

  constructor(publicClient: PublicClient, wallet: WalletClient, registry: Address) {
    this.publicClient = publicClient;
    this.wallet = wallet;
    this.registry = registry;
  }

  async sync(root: bigint): Promise<{ action: Action; hash?: Hash }> {
    const read = <T extends "current" | "updatedAt" | "maxAge">(functionName: T) =>
      this.publicClient.readContract({
        address: this.registry,
        abi: rootRegistryAbi,
        functionName,
      });
    const [current, updatedAt, maxAge, block] = await Promise.all([
      read("current"),
      read("updatedAt"),
      read("maxAge"),
      this.publicClient.getBlock(),
    ]);

    const action = decide(
      { current, updatedAt: BigInt(updatedAt), maxAge: BigInt(maxAge) },
      root,
      block.timestamp,
    );
    if (action === "unchanged") return { action };
    return { action, hash: await this.send(action, root) };
  }

  private async send(action: "publish" | "refresh", root: bigint): Promise<Hash> {
    const account = this.wallet.account as Account;
    const fees = await feeParams(this.publicClient);
    const hash =
      action === "publish"
        ? await this.wallet.writeContract({
            address: this.registry,
            abi: rootRegistryAbi,
            functionName: "publish",
            args: [root],
            account,
            chain: this.wallet.chain,
            ...fees,
          })
        : await this.wallet.writeContract({
            address: this.registry,
            abi: rootRegistryAbi,
            functionName: "refresh",
            account,
            chain: this.wallet.chain,
            ...fees,
          });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${action} transaction ${hash} reverted`);
    return hash;
  }
}

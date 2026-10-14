import type { Account, Address, Hash, Hex, PublicClient, WalletClient } from "viem";
import { complianceRegistryAbi, rootRegistryAbi, settlementAbi } from "./abi.ts";
import type { Deployment } from "./deployment.ts";
import type { Point } from "./disclosure.ts";
import type { MerkleTree } from "./merkle.ts";
import type { ComplianceContext, ComplianceProof } from "./prover.ts";
import type { SortedTree } from "./sorted-tree.ts";
import type { Terms } from "./trade.ts";
import { submit } from "./tx.ts";

export type Policy = { minTier: number; maxProofAge: bigint; attestationTtl: bigint };

export type Lists = {
  issuers: MerkleTree;
  issuerIndex?: number;
  sanctions: SortedTree;
  revocations: SortedTree;
};

/** Typed access to a Keelson deployment: reads, proof context, and the three transactions a party sends. */
export class KeelsonClient {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | undefined;
  readonly deployment: Deployment;

  constructor(options: {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    deployment: Deployment;
  }) {
    this.publicClient = options.publicClient;
    this.walletClient = options.walletClient;
    this.deployment = options.deployment;
  }

  async policy(): Promise<Policy> {
    const [minTier, maxProofAge, attestationTtl] = await this.publicClient.readContract({
      address: this.deployment.compliance,
      abi: complianceRegistryAbi,
      functionName: "policy",
    });
    return { minTier, maxProofAge, attestationTtl };
  }

  async regulatorKey(): Promise<Point> {
    const [x, y] = await Promise.all([
      this.publicClient.readContract({
        address: this.deployment.compliance,
        abi: complianceRegistryAbi,
        functionName: "regulatorKeyX",
      }),
      this.publicClient.readContract({
        address: this.deployment.compliance,
        abi: complianceRegistryAbi,
        functionName: "regulatorKeyY",
      }),
    ]);
    return { x, y };
  }

  async isCompliant(tradeId: bigint, party: Address): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.deployment.compliance,
      abi: complianceRegistryAbi,
      functionName: "isCompliant",
      args: [tradeId, party],
    });
  }

  async isSettled(tradeId: bigint): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.deployment.settlement,
      abi: settlementAbi,
      functionName: "settled",
      args: [tradeId],
    });
  }

  /**
   * Builds the context a proof is made against and checks that the contract currently accepts the
   * roots of the given lists, so a stale snapshot fails here instead of reverting on-chain.
   */
  async loadContext(lists: Lists): Promise<ComplianceContext> {
    const checks: [string, Address, bigint][] = [
      ["issuers", this.deployment.issuers, lists.issuers.root],
      ["sanctions", this.deployment.sanctions, lists.sanctions.root],
      ["revocations", this.deployment.revocations, lists.revocations.root],
    ];
    for (const [name, address, root] of checks) {
      const version = await this.publicClient.readContract({
        address,
        abi: rootRegistryAbi,
        functionName: "acceptedVersion",
        args: [root],
      });
      if (version === 0n) {
        throw new Error(`the ${name} list is not accepted by the registry: refresh the snapshot`);
      }
    }

    const [policy, regulatorKey, block] = await Promise.all([
      this.policy(),
      this.regulatorKey(),
      this.publicClient.getBlock(),
    ]);
    return {
      issuers: lists.issuers,
      issuerIndex: lists.issuerIndex ?? 0,
      sanctions: lists.sanctions,
      revocations: lists.revocations,
      regulatorKey,
      minTier: BigInt(policy.minTier),
      validAt: block.timestamp,
    };
  }

  attest(proof: ComplianceProof): Promise<Hash> {
    const { a, b, c } = proof.calldata;
    const signals = proof.signals as unknown as FixedSignals;
    return this.send((wallet, fees) =>
      wallet.writeContract({
        address: this.deployment.compliance,
        abi: complianceRegistryAbi,
        functionName: "attest",
        args: [a, b, c, signals],
        account: wallet.account as Account,
        chain: wallet.chain,
        ...fees,
      }),
    );
  }

  commit(tradeId: bigint, termsHash: Hex): Promise<Hash> {
    return this.send((wallet, fees) =>
      wallet.writeContract({
        address: this.deployment.settlement,
        abi: settlementAbi,
        functionName: "commit",
        args: [tradeId, termsHash],
        account: wallet.account as Account,
        chain: wallet.chain,
        ...fees,
      }),
    );
  }

  settle(tradeId: bigint, terms: Terms, salt: Hex): Promise<Hash> {
    return this.send((wallet, fees) =>
      wallet.writeContract({
        address: this.deployment.settlement,
        abi: settlementAbi,
        functionName: "settle",
        args: [tradeId, terms, salt],
        account: wallet.account as Account,
        chain: wallet.chain,
        ...fees,
      }),
    );
  }

  private send(write: Parameters<typeof submit>[2]): Promise<Hash> {
    return submit(this.publicClient, this.walletClient, write);
  }
}

type FixedSignals = readonly [
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

import { complianceRegistryAbi } from "@keelson/sdk/abi";
import type { ListStatus } from "../lists/status.ts";
import type { Chain } from "../state/context.tsx";

export class ProofContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofContextError";
  }
}

export type ProofContext = {
  minTier: bigint;
  validAt: bigint;
  regulatorKey: { x: bigint; y: bigint };
};

/** What a proof is made against on chain right now; refuses while any list is not accepted. */
export async function readProofContext(chain: Chain, status: ListStatus[]): Promise<ProofContext> {
  const stale = status.find((item) => item.state !== "accepted");
  if (stale) {
    throw new ProofContextError(
      stale.state === "stale"
        ? `The ${stale.name.toLowerCase()} list is not accepted by the contract yet. Wait for it to be published and try again.`
        : `The ${stale.name.toLowerCase()} list could not be checked against the contract.`,
    );
  }
  const { file, client } = chain;
  const [policy, regulatorKeyX, regulatorKeyY, block] = await Promise.all([
    client.readContract({
      address: file.compliance,
      abi: complianceRegistryAbi,
      functionName: "policy",
    }),
    client.readContract({
      address: file.compliance,
      abi: complianceRegistryAbi,
      functionName: "regulatorKeyX",
    }),
    client.readContract({
      address: file.compliance,
      abi: complianceRegistryAbi,
      functionName: "regulatorKeyY",
    }),
    client.getBlock(),
  ]);
  const [minTier] = policy as readonly [number, bigint, bigint];
  return {
    minTier: BigInt(minTier),
    validAt: block.timestamp,
    regulatorKey: { x: regulatorKeyX, y: regulatorKeyY },
  };
}

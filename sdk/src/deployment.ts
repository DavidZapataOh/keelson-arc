import type { Address } from "viem";

export type Deployment = {
  chainId: number;
  verifier: Address;
  issuers: Address;
  sanctions: Address;
  revocations: Address;
  compliance: Address;
  settlement: Address;
};

type Transaction = { transactionType?: string; contractName?: string; contractAddress?: string };

/** Reads the addresses of a deployment from the `run-latest.json` Foundry writes when broadcasting. */
export function readBroadcast(broadcast: unknown): Deployment {
  const { chain, transactions } = broadcast as { chain?: number; transactions?: Transaction[] };
  if (typeof chain !== "number" || !Array.isArray(transactions))
    throw new Error("not a Foundry broadcast file");

  const created = transactions.filter((tx) => tx.transactionType === "CREATE");
  const named = (name: string) =>
    created.filter((tx) => tx.contractName === name).map((tx) => tx.contractAddress as Address);
  const one = (name: string): Address => {
    const [address, ...rest] = named(name);
    if (!address || rest.length > 0)
      throw new Error(`expected exactly one ${name} in the broadcast`);
    return address;
  };

  const [issuers, sanctions, revocations, ...extra] = named("RootRegistry");
  if (!issuers || !sanctions || !revocations || extra.length > 0) {
    throw new Error("expected exactly three RootRegistry deployments in the broadcast");
  }
  return {
    chainId: chain,
    verifier: one("ComplianceVerifier"),
    issuers,
    sanctions,
    revocations,
    compliance: one("ComplianceRegistry"),
    settlement: one("Settlement"),
  };
}

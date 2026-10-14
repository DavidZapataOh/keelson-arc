import { rootRegistryAbi } from "@keelson/sdk/abi";
import type { Address, PublicClient } from "viem";

export type ListState = "accepted" | "stale" | "unknown";

export type ListStatus = {
  name: "Issuers" | "Sanctions" | "Revocations";
  root: bigint;
  version: bigint;
  state: ListState;
};

type Registries = { issuers: Address; sanctions: Address; revocations: Address };

export type Roots = { issuers: bigint; sanctions: bigint; revocations: bigint };

/** A list is usable only while the registry accepts its root; a read that fails is `unknown`, never `accepted`. */
export async function listStatus(
  client: PublicClient,
  registries: Registries,
  roots: Roots,
): Promise<ListStatus[]> {
  const entries = [
    ["Issuers", registries.issuers, roots.issuers],
    ["Sanctions", registries.sanctions, roots.sanctions],
    ["Revocations", registries.revocations, roots.revocations],
  ] as const;
  return Promise.all(
    entries.map(async ([name, address, root]): Promise<ListStatus> => {
      try {
        const version = (await client.readContract({
          address,
          abi: rootRegistryAbi,
          functionName: "acceptedVersion",
          args: [root],
        })) as bigint;
        return { name, root, version, state: version === 0n ? "stale" : "accepted" };
      } catch {
        return { name, root, version: 0n, state: "unknown" };
      }
    }),
  );
}

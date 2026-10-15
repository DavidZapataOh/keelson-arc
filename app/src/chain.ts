import { arc } from "@keelson/sdk/arc";
import { type Chain, defineChain } from "viem";
import { arcTestnet } from "viem/chains";

export type CircuitHashes = { wasm?: string | undefined; zkey?: string | undefined };

export type Network = {
  id: "mainnet" | "testnet" | "default";
  label: string;
  chain: Chain;
  /** Where this network's deployment file is served. */
  deploymentUrl: string;
  /** The SHA-256 of the circuit files this network's verifier was built from, pinned at build time. */
  hashes: CircuitHashes;
  /** False for a network the site was built without: it is listed but cannot be chosen. */
  available: boolean;
};

const STORAGE_KEY = "keelson.network";

type Built = Partial<Record<"mainnet" | "testnet", CircuitHashes>>;

/**
 * The networks a build offers. A site built with VITE_NETWORKS lists Arc mainnet and Arc testnet and lets
 * the visitor choose between those it includes. A build without it targets one network: Arc mainnet, or
 * with VITE_CHAIN_ID Arc testnet or, for tests, a local node.
 */
export function networksFor(env: ImportMetaEnv): Network[] {
  if (env.VITE_NETWORKS) {
    const built = JSON.parse(env.VITE_NETWORKS) as Built;
    return [
      {
        id: "mainnet",
        label: "ARC MAINNET",
        chain: arc,
        deploymentUrl: "/deployment.mainnet.json",
        hashes: built.mainnet ?? {},
        available: built.mainnet !== undefined,
      },
      {
        id: "testnet",
        label: "ARC TESTNET",
        chain: arcTestnet,
        deploymentUrl: "/deployment.testnet.json",
        hashes: built.testnet ?? {},
        available: built.testnet !== undefined,
      },
    ];
  }
  const override = env.VITE_CHAIN_ID;
  const chain = !override
    ? arc
    : Number(override) === arcTestnet.id
      ? arcTestnet
      : defineChain({ ...arc, id: Number(override), contracts: undefined });
  return [
    {
      id: "default",
      label:
        chain.id === arc.id
          ? "ARC MAINNET"
          : chain.id === arcTestnet.id
            ? "ARC TESTNET"
            : "LOCAL NODE",
      chain,
      deploymentUrl: env.VITE_DEPLOYMENT_URL ?? "/deployment.json",
      get hashes() {
        return { wasm: env.VITE_CIRCUIT_WASM_SHA256, zkey: env.VITE_CIRCUIT_ZKEY_SHA256 };
      },
      available: true,
    },
  ];
}

/** The visitor's remembered choice if it can be used, otherwise the first network the build includes. */
export function chooseNetwork(networks: Network[], stored: string | null): Network {
  const remembered = networks.find((network) => network.available && network.id === stored);
  const chosen = remembered ?? networks.find((network) => network.available);
  if (!chosen) throw new Error("this build includes no network");
  return chosen;
}

const remembered = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const NETWORKS = networksFor(import.meta.env);
export const SELECTED = chooseNetwork(NETWORKS, remembered());
export const ARC = SELECTED.chain;
export const NETWORK_LABEL = SELECTED.label;

/** Remembers the choice and reloads, so that nothing keeps state from the other network. */
export function selectNetwork(id: Network["id"]): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    return;
  }
  window.location.reload();
}

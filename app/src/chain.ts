import { arc } from "@keelson/sdk/arc";
import { defineChain } from "viem";
import { arcTestnet } from "viem/chains";

const override = import.meta.env.VITE_CHAIN_ID;

/**
 * Arc mainnet. A build made with VITE_CHAIN_ID targets Arc testnet (5042002) or, for tests, a local node.
 * A default build accepts mainnet only.
 */
export const ARC = !override
  ? arc
  : Number(override) === arcTestnet.id
    ? arcTestnet
    : defineChain({ ...arc, id: Number(override), contracts: undefined });

/** What the network badge says: Arc mainnet, Arc testnet, or a plain "local" for a test node. */
export const NETWORK_LABEL =
  ARC.id === arc.id ? "ARC MAINNET" : ARC.id === arcTestnet.id ? "ARC TESTNET" : "LOCAL NODE";

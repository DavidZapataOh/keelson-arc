import { arc } from "@keelson/sdk/arc";
import { defineChain } from "viem";

const override = import.meta.env.VITE_CHAIN_ID;

/** Arc mainnet. Only a build made with VITE_CHAIN_ID, which tests use for a local node, can differ. */
export const ARC = override ? defineChain({ ...arc, id: Number(override) }) : arc;

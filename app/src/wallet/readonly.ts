import { arc } from "@keelson/sdk/arc";
import { type Address, getAddress } from "viem";
import type { Session, Snapshot } from "./session.ts";

/** A session that can read and export but never sign: for custody teams without a browser wallet. */
export function readOnly(address: string): Session {
  const snapshot: Snapshot = { address: getAddress(address as Address), chainId: arc.id };
  return {
    kind: "readonly",
    name: "Read-only",
    snapshot,
    walletClient: undefined,
    onChange: () => () => undefined,
    switchChain: async () => undefined,
    close: () => undefined,
  };
}

import type { HeldCredential } from "@keelson/sdk/credential";
import type { ProofCalldata } from "@keelson/sdk/proof";
import type { ArtifactSpec } from "./artifacts.ts";

export type ProveRequest = {
  held: HeldCredential;
  tradeId: bigint;
  tradingAddress: bigint;
  minTier: bigint;
  validAt: bigint;
  regulatorKey: { x: bigint; y: bigint };
  issuerIndex: number;
  artifacts: ArtifactSpec;
};

export type ProveResult = { calldata: ProofCalldata; signals: bigint[] };

export type ProveProgress =
  | { phase: "download"; loaded: number; total: number }
  | { phase: "verify" }
  | { phase: "prove" };

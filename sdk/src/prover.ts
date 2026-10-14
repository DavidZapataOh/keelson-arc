import * as snarkjs from "snarkjs";
import { type ComplianceRequest, complianceInput } from "./compliance.ts";
import type { HeldCredential } from "./credential.ts";
import { randomEphemeral } from "./disclosure.ts";
import { type ProofCalldata, toCalldata } from "./proof.ts";

/** Circuit artifacts: file paths or URLs (Node and browsers) or the bytes themselves. */
export type ProvingKeys = { wasm: string | Uint8Array; zkey: string | Uint8Array };

/** The public state a proof is made against. */
export type ComplianceContext = Pick<
  ComplianceRequest,
  "issuers" | "issuerIndex" | "sanctions" | "revocations" | "regulatorKey" | "minTier" | "validAt"
>;

export type ComplianceProof = { calldata: ProofCalldata; signals: bigint[] };

const PUBLIC_SIGNALS = 13;

/** Proves a held credential is eligible for a trade; throws if it is revoked or sanctioned. */
export async function proveCompliance(args: {
  held: HeldCredential;
  tradeId: bigint;
  tradingAddress: bigint;
  context: ComplianceContext;
  keys: ProvingKeys;
  ephemeral?: bigint;
}): Promise<ComplianceProof> {
  const input = complianceInput({
    ...args.context,
    credential: args.held.credential,
    signature: args.held.signature,
    issuerKey: args.held.issuerKey,
    tradeId: args.tradeId,
    tradingAddress: args.tradingAddress,
    ephemeral: args.ephemeral ?? randomEphemeral(),
  });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    args.keys.wasm,
    args.keys.zkey,
  );
  if (publicSignals.length !== PUBLIC_SIGNALS)
    throw new Error("unexpected number of public signals");
  return { calldata: toCalldata(proof), signals: publicSignals.map(BigInt) };
}

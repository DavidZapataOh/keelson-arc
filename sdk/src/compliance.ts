import type { Credential, Issuer } from "./credential.ts";
import { signCredential } from "./credential.ts";
import type { Point } from "./disclosure.ts";
import type { MerkleTree } from "./merkle.ts";
import type { SortedTree } from "./sorted-tree.ts";

export type ComplianceRequest = {
  credential: Credential;
  issuer: Issuer;
  issuers: MerkleTree;
  issuerIndex: number;
  sanctions: SortedTree;
  revocations: SortedTree;
  tradeId: bigint;
  tradingAddress: bigint;
  minTier: bigint;
  validAt: bigint;
  regulatorKey: Point;
  ephemeral: bigint;
};

/** Builds the input object of the Compliance circuit; throws if the holder is not eligible. */
export const complianceInput = (request: ComplianceRequest) => {
  const { credential, issuer } = request;
  const issuerPath = request.issuers.prove(request.issuerIndex);
  const revocation = request.revocations.prove(credential.credentialId);
  const sanctions = credential.identifiers.map((id) => request.sanctions.prove(id));

  return {
    tradeId: request.tradeId,
    tradingAddress: request.tradingAddress,
    issuersRoot: request.issuers.root,
    sanctionsRoot: request.sanctions.root,
    revocationRoot: request.revocations.root,
    minTier: request.minTier,
    validAt: request.validAt,
    regulatorKeyX: request.regulatorKey.x,
    regulatorKeyY: request.regulatorKey.y,
    ephemeral: request.ephemeral,
    secret: credential.secret,
    credentialId: credential.credentialId,
    tier: credential.tier,
    jurisdiction: credential.jurisdiction,
    expiry: credential.expiry,
    identifiers: credential.identifiers,
    issuerAx: issuer.Ax,
    issuerAy: issuer.Ay,
    ...signCredential(issuer, credential),
    issuerSiblings: issuerPath.siblings,
    issuerPathBits: issuerPath.pathBits,
    sanctionsLow: sanctions.map((w) => w.low),
    sanctionsNext: sanctions.map((w) => w.next),
    sanctionsSiblings: sanctions.map((w) => w.siblings),
    sanctionsPathBits: sanctions.map((w) => w.pathBits),
    revocationLow: revocation.low,
    revocationNext: revocation.next,
    revocationSiblings: revocation.siblings,
    revocationPathBits: revocation.pathBits,
  };
};

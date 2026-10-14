import {
  type ComplianceRequest,
  type Credential,
  type Issuer,
  issuerFromKey,
  issuerLeaf,
  MerkleTree,
  SortedTree,
} from "@keelson/sdk";

export const issuer: Issuer = issuerFromKey(new Uint8Array(32).fill(7));
export const otherIssuer: Issuer = issuerFromKey(new Uint8Array(32).fill(9));

export const issuers = new MerkleTree(2, [issuerLeaf(issuer)]);
export const sanctions = new SortedTree(4, [111n, 222n, 333n]);
export const revocations = new SortedTree(4, [999n]);

export const credential: Credential = {
  secret: 12345n,
  credentialId: 42n,
  tier: 2n,
  jurisdiction: 840n,
  expiry: 2_000_000_000n,
  identifiers: [1000n, 2000n],
};

export const request: ComplianceRequest = {
  credential,
  issuer,
  issuers,
  issuerIndex: 0,
  sanctions,
  revocations,
  tradeId: 1n,
  tradingAddress: 0xabcdn,
  minTier: 1n,
  validAt: 1_800_000_000n,
};

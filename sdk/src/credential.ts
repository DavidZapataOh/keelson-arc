import { buildEddsa } from "circomlibjs";
import { hash } from "./poseidon.ts";

const eddsa = await buildEddsa();
const field = eddsa.babyJub.F;

export type Credential = {
  secret: bigint;
  credentialId: bigint;
  tier: bigint;
  jurisdiction: bigint;
  expiry: bigint;
  identifiers: bigint[];
};

export type Issuer = { privateKey: Uint8Array; Ax: bigint; Ay: bigint };

export type Signature = { sigS: bigint; sigR8x: bigint; sigR8y: bigint };

export const issuerFromKey = (privateKey: Uint8Array): Issuer => {
  const [x, y] = eddsa.prv2pub(privateKey);
  return { privateKey, Ax: field.toObject(x), Ay: field.toObject(y) };
};

export const issuerLeaf = (issuer: Pick<Issuer, "Ax" | "Ay">): bigint =>
  hash([issuer.Ax, issuer.Ay]);

export const subjectOf = (secret: bigint): bigint => hash([secret]);

export const nullifierOf = (secret: bigint, tradeId: bigint): bigint => hash([secret, tradeId]);

export const credentialMessage = (credential: Credential): bigint =>
  hash([
    subjectOf(credential.secret),
    credential.credentialId,
    credential.tier,
    credential.jurisdiction,
    credential.expiry,
    ...credential.identifiers,
  ]);

export const signCredential = (issuer: Issuer, credential: Credential): Signature => {
  const signature = eddsa.signPoseidon(issuer.privateKey, field.e(credentialMessage(credential)));
  return {
    sigS: signature.S,
    sigR8x: field.toObject(signature.R8[0]),
    sigR8y: field.toObject(signature.R8[1]),
  };
};

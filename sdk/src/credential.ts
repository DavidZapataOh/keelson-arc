import { buildEddsa } from "circomlibjs";
import { hash } from "./poseidon.ts";

const eddsa = await buildEddsa();
const field = eddsa.babyJub.F;

/** What the holder keeps: the claims plus the secret that their subject is derived from. */
export type Credential = {
  secret: bigint;
  credentialId: bigint;
  tier: bigint;
  jurisdiction: bigint;
  expiry: bigint;
  identifiers: bigint[];
};

/** What the issuer signs. It never sees the holder's secret, only the subject derived from it. */
export type Claims = Omit<Credential, "secret"> & { subject: bigint };

export type IssuerKey = { Ax: bigint; Ay: bigint };

export type Issuer = IssuerKey & { privateKey: Uint8Array };

export type Signature = { sigS: bigint; sigR8x: bigint; sigR8y: bigint };

/** A credential as delivered by an issuer, before the holder attaches the secret. */
export type IssuedCredential = { claims: Claims; signature: Signature; issuerKey: IssuerKey };

/** A credential the holder can prove with. */
export type HeldCredential = { credential: Credential; signature: Signature; issuerKey: IssuerKey };

export const issuerFromKey = (privateKey: Uint8Array): Issuer => {
  const [x, y] = eddsa.prv2pub(privateKey);
  return { privateKey, Ax: field.toObject(x), Ay: field.toObject(y) };
};

export const issuerLeaf = (key: IssuerKey): bigint => hash([key.Ax, key.Ay]);

export const subjectOf = (secret: bigint): bigint => hash([secret]);

export const nullifierOf = (secret: bigint, tradeId: bigint): bigint => hash([secret, tradeId]);

export const claimsOf = ({ secret, ...rest }: Credential): Claims => ({
  subject: subjectOf(secret),
  ...rest,
});

export const claimsMessage = (claims: Claims): bigint =>
  hash([
    claims.subject,
    claims.credentialId,
    claims.tier,
    claims.jurisdiction,
    claims.expiry,
    ...claims.identifiers,
  ]);

export const credentialMessage = (credential: Credential): bigint =>
  claimsMessage(claimsOf(credential));

export const signClaims = (issuer: Issuer, claims: Claims): Signature => {
  const signature = eddsa.signPoseidon(issuer.privateKey, field.e(claimsMessage(claims)));
  return {
    sigS: signature.S,
    sigR8x: field.toObject(signature.R8[0]),
    sigR8y: field.toObject(signature.R8[1]),
  };
};

export const signCredential = (issuer: Issuer, credential: Credential): Signature =>
  signClaims(issuer, claimsOf(credential));

export const verifySignature = (key: IssuerKey, claims: Claims, signature: Signature): boolean =>
  eddsa.verifyPoseidon(
    field.e(claimsMessage(claims)),
    { R8: [field.e(signature.sigR8x), field.e(signature.sigR8y)], S: signature.sigS },
    [field.e(key.Ax), field.e(key.Ay)],
  );

/** Attaches the holder's secret to an issued credential after checking it is theirs and authentic. */
export const holdCredential = (secret: bigint, issued: IssuedCredential): HeldCredential => {
  if (issued.claims.subject !== subjectOf(secret))
    throw new Error("credential was issued to another subject");
  if (!verifySignature(issued.issuerKey, issued.claims, issued.signature)) {
    throw new Error("credential signature is invalid");
  }
  const { subject: _subject, ...rest } = issued.claims;
  return {
    credential: { secret, ...rest },
    signature: issued.signature,
    issuerKey: issued.issuerKey,
  };
};

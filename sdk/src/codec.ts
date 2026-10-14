import type { Claims, IssuedCredential, IssuerKey, Signature } from "./credential.ts";

type Json = Record<string, unknown>;

const text = (value: unknown, name: string): bigint => {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value))
    throw new Error(`${name} must be a decimal string`);
  return BigInt(value);
};

const record = (value: unknown, name: string): Json => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Json;
};

/** Serializes an issued credential for transport; every number is a decimal string. */
export const issuedToJson = (issued: IssuedCredential): Json => ({
  claims: {
    subject: issued.claims.subject.toString(),
    credentialId: issued.claims.credentialId.toString(),
    tier: issued.claims.tier.toString(),
    jurisdiction: issued.claims.jurisdiction.toString(),
    expiry: issued.claims.expiry.toString(),
    identifiers: issued.claims.identifiers.map(String),
  },
  signature: {
    sigS: issued.signature.sigS.toString(),
    sigR8x: issued.signature.sigR8x.toString(),
    sigR8y: issued.signature.sigR8y.toString(),
  },
  issuerKey: { Ax: issued.issuerKey.Ax.toString(), Ay: issued.issuerKey.Ay.toString() },
});

export const issuedFromJson = (input: unknown): IssuedCredential => {
  const root = record(input, "credential");
  const c = record(root.claims, "claims");
  const s = record(root.signature, "signature");
  const k = record(root.issuerKey, "issuerKey");
  if (!Array.isArray(c.identifiers)) throw new Error("identifiers must be an array");

  const claims: Claims = {
    subject: text(c.subject, "subject"),
    credentialId: text(c.credentialId, "credentialId"),
    tier: text(c.tier, "tier"),
    jurisdiction: text(c.jurisdiction, "jurisdiction"),
    expiry: text(c.expiry, "expiry"),
    identifiers: c.identifiers.map((id, i) => text(id, `identifiers[${i}]`)),
  };
  const signature: Signature = {
    sigS: text(s.sigS, "sigS"),
    sigR8x: text(s.sigR8x, "sigR8x"),
    sigR8y: text(s.sigR8y, "sigR8y"),
  };
  const issuerKey: IssuerKey = { Ax: text(k.Ax, "Ax"), Ay: text(k.Ay, "Ay") };
  return { claims, signature, issuerKey };
};

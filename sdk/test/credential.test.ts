import { describe, expect, it } from "vitest";
import {
  type Credential,
  claimsMessage,
  claimsOf,
  credentialMessage,
  holdCredential,
  issuerFromKey,
  issuerLeaf,
  nullifierOf,
  signClaims,
  signCredential,
  subjectOf,
  verifySignature,
} from "../src/credential.ts";
import { hash } from "../src/poseidon.ts";

const credential: Credential = {
  secret: 12345n,
  credentialId: 42n,
  tier: 2n,
  jurisdiction: 840n,
  expiry: 2_000_000_000n,
  identifiers: [1000n, 2000n],
};

describe("credential", () => {
  it("binds every field into the signed message", () => {
    const base = credentialMessage(credential);
    const changes: Partial<Credential>[] = [
      { secret: 12346n },
      { credentialId: 43n },
      { tier: 3n },
      { jurisdiction: 1n },
      { expiry: 2_000_000_001n },
      { identifiers: [1000n, 2001n] },
      { identifiers: [2000n, 1000n] },
    ];
    for (const change of changes) {
      expect(credentialMessage({ ...credential, ...change })).not.toBe(base);
    }
  });

  it("hides the secret behind a subject and scopes nullifiers to trades", () => {
    expect(subjectOf(12345n)).toBe(hash([12345n]));
    expect(nullifierOf(12345n, 1n)).toBe(nullifierOf(12345n, 1n));
    expect(nullifierOf(12345n, 1n)).not.toBe(nullifierOf(12345n, 2n));
    expect(nullifierOf(12346n, 1n)).not.toBe(nullifierOf(12345n, 1n));
  });

  it("derives a stable issuer identity and a deterministic signature", () => {
    const issuer = issuerFromKey(new Uint8Array(32).fill(7));
    expect(issuerFromKey(new Uint8Array(32).fill(7)).Ax).toBe(issuer.Ax);
    expect(issuerFromKey(new Uint8Array(32).fill(8)).Ax).not.toBe(issuer.Ax);
    expect(issuerLeaf(issuer)).toBe(hash([issuer.Ax, issuer.Ay]));
    expect(signCredential(issuer, credential)).toEqual(signCredential(issuer, credential));
  });
  it("signs claims without the secret and the holder can still prove with the result", () => {
    const issuer = issuerFromKey(new Uint8Array(32).fill(7));
    const claims = claimsOf(credential);
    const signature = signClaims(issuer, claims);

    expect(signature).toEqual(signCredential(issuer, credential));
    expect(claimsMessage(claims)).toBe(credentialMessage(credential));
    expect(verifySignature(issuer, claims, signature)).toBe(true);

    const held = holdCredential(credential.secret, { claims, signature, issuerKey: issuer });
    expect(held.credential).toEqual(credential);
  });

  it("rejects signatures over other claims or by other issuers", () => {
    const issuer = issuerFromKey(new Uint8Array(32).fill(7));
    const other = issuerFromKey(new Uint8Array(32).fill(8));
    const claims = claimsOf(credential);
    const signature = signClaims(issuer, claims);

    expect(verifySignature(issuer, { ...claims, tier: 3n }, signature)).toBe(false);
    expect(verifySignature(other, claims, signature)).toBe(false);
  });

  it("refuses to hold a credential issued to someone else or with a bad signature", () => {
    const issuer = issuerFromKey(new Uint8Array(32).fill(7));
    const claims = claimsOf(credential);
    const signature = signClaims(issuer, claims);

    expect(() =>
      holdCredential(credential.secret + 1n, { claims, signature, issuerKey: issuer }),
    ).toThrow("another subject");
    expect(() =>
      holdCredential(credential.secret, {
        claims: { ...claims, tier: 3n },
        signature,
        issuerKey: issuer,
      }),
    ).toThrow("signature is invalid");
  });
});

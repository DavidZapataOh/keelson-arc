import { describe, expect, it } from "vitest";
import {
  type Credential,
  credentialMessage,
  issuerFromKey,
  issuerLeaf,
  nullifierOf,
  signCredential,
  subjectOf,
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
});

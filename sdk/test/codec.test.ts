import { describe, expect, it } from "vitest";
import { issuedFromJson, issuedToJson } from "../src/codec.ts";
import {
  claimsOf,
  type IssuedCredential,
  issuerFromKey,
  signCredential,
} from "../src/credential.ts";

const issuer = issuerFromKey(new Uint8Array(32).fill(7));
const credential = {
  secret: 12345n,
  credentialId: 42n,
  tier: 2n,
  jurisdiction: 840n,
  expiry: 2_000_000_000n,
  identifiers: [1000n, 2000n],
};
const issued: IssuedCredential = {
  claims: claimsOf(credential),
  signature: signCredential(issuer, credential),
  issuerKey: { Ax: issuer.Ax, Ay: issuer.Ay },
};

describe("issued credential codec", () => {
  it("round-trips through JSON text without losing precision", () => {
    const text = JSON.stringify(issuedToJson(issued));
    expect(issuedFromJson(JSON.parse(text))).toEqual(issued);
  });

  it("writes every number as a decimal string", () => {
    const json = issuedToJson(issued) as { claims: { subject: unknown; identifiers: unknown[] } };
    expect(typeof json.claims.subject).toBe("string");
    expect(json.claims.identifiers).toEqual(["1000", "2000"]);
  });

  it("rejects malformed input with a message naming the field", () => {
    const good = JSON.parse(JSON.stringify(issuedToJson(issued)));
    expect(() => issuedFromJson(null)).toThrow("credential must be an object");
    expect(() => issuedFromJson({ ...good, claims: { ...good.claims, tier: 2 } })).toThrow(
      "tier must be a decimal string",
    );
    expect(() => issuedFromJson({ ...good, claims: { ...good.claims, tier: "-1" } })).toThrow(
      "tier",
    );
    expect(() => issuedFromJson({ ...good, claims: { ...good.claims, identifiers: "x" } })).toThrow(
      "identifiers must be an array",
    );
    expect(() => issuedFromJson({ ...good, signature: undefined })).toThrow(
      "signature must be an object",
    );
  });
});

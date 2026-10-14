import { identifierHash } from "@keelson/lists";
import { claimsOf, IDENTIFIER_COUNT, subjectOf, verifySignature } from "@keelson/sdk";
import { describe, expect, it } from "vitest";
import { MAX_VALIDITY_SECONDS, RequestError } from "../src/service.ts";
import { hold, holderSecret, NOW, newService, sanctionedAddress, validRequest } from "./support.ts";

describe("IssuerService.issue", () => {
  it("signs claims that verify against the issuer key and that the holder can use", () => {
    const { service } = newService();
    const issued = service.issue(validRequest());

    expect(verifySignature(service.key, issued.claims, issued.signature)).toBe(true);
    expect(issued.issuerKey).toEqual(service.key);
    expect(issued.claims.identifiers).toEqual([
      identifierHash({ kind: "id", value: "LEI 5493001KJTIIGC8Y1R12" }),
      identifierHash({ kind: "address", value: "0x1111111111111111111111111111111111111111" }),
    ]);
    const held = hold(issued);
    expect(claimsOf(held.credential)).toEqual(issued.claims);
    expect(held.credential.secret).toBe(holderSecret);
  });

  it("gives every credential a fresh 248-bit id and never learns the secret", () => {
    const { service } = newService();
    const secret = 31415926535897932384626433832795028841971n;
    const a = service.issue(validRequest({ subject: subjectOf(secret) }));
    const b = service.issue(validRequest());
    expect(a.claims.credentialId).not.toBe(b.claims.credentialId);
    expect(a.claims.credentialId).toBeLessThan(1n << 248n);
    expect(JSON.stringify(a, (_, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(
      secret.toString(),
    );
  });

  it("retries until the random id is in range", () => {
    const draws = [new Uint8Array(31), new Uint8Array(31).fill(7)];
    const { service } = newService(() => draws.shift() as Uint8Array);
    expect(service.issue(validRequest()).claims.credentialId).toBe(BigInt(`0x${"07".repeat(31)}`));
  });

  it("refuses to issue to a holder with a sanctioned identifier", () => {
    const { service } = newService();
    const address = validRequest({
      identifiers: [
        { kind: "id", value: "LEI 5493001KJTIIGC8Y1R12" },
        { kind: "address", value: sanctionedAddress.toUpperCase().replace("0X", "0x") },
      ],
    });
    expect(() => service.issue(address)).toThrow("sanctions list");
    const id = validRequest({
      identifiers: [
        { kind: "id", value: "040-070-827" },
        { kind: "address", value: "0x1111111111111111111111111111111111111111" },
      ],
    });
    expect(() => service.issue(id)).toThrow("sanctions list");
  });

  it("validates every field of the request", () => {
    const { service } = newService();
    const bad: [Record<string, unknown>, string][] = [
      [{ subject: 0n }, "subject"],
      [{ tier: 256 }, "tier"],
      [{ tier: 1.5 }, "tier"],
      [{ jurisdiction: 0 }, "jurisdiction"],
      [{ jurisdiction: 1000 }, "jurisdiction"],
      [{ expiry: NOW }, "expiry"],
      [{ expiry: NOW + MAX_VALIDITY_SECONDS + 1 }, "expiry"],
      [{ identifiers: [] }, `${IDENTIFIER_COUNT} identifiers`],
      [{ identifiers: validRequest().identifiers.slice(0, 1) }, `${IDENTIFIER_COUNT} identifiers`],
      [{ entityRef: "" }, "entityRef"],
      [{ entityRef: "x".repeat(257) }, "entityRef"],
      [
        {
          identifiers: [
            { kind: "id", value: "123" },
            { kind: "address", value: "0x1111111111111111111111111111111111111111" },
          ],
        },
        "too short",
      ],
    ];
    for (const [override, message] of bad) {
      expect(() => service.issue(validRequest(override)), message).toThrow(RequestError);
      expect(() => service.issue(validRequest(override))).toThrow(message);
    }
  });

  it("records nothing for a refused request", () => {
    const { service, store } = newService();
    expect(() => service.issue(validRequest({ tier: 999 }))).toThrow();
    expect(store.bySubject(validRequest().subject)).toEqual([]);
  });
});

describe("revocation and lookup", () => {
  it("publishes a snapshot of revoked ids that changes only when something is revoked", () => {
    const { service } = newService();
    const a = service.issue(validRequest());
    const b = service.issue(validRequest());
    const empty = service.revocations();
    expect(empty.values).toEqual([]);

    expect(service.revoke(a.claims.credentialId)).toBe(true);
    const afterOne = service.revocations();
    expect(afterOne.values).toHaveLength(1);
    expect(afterOne.root).not.toBe(empty.root);

    expect(service.revoke(a.claims.credentialId)).toBe(true);
    expect(service.revocations().root).toBe(afterOne.root);

    service.revoke(b.claims.credentialId);
    expect(service.revocations().values).toHaveLength(2);
    expect(afterOne.format).toBe("keelson.revocations.v1");
    expect(afterOne.depth).toBe(16);
  });

  it("does not revoke what it never issued", () => {
    const { service } = newService();
    expect(service.revoke(12345n)).toBe(false);
    expect(service.revocations().values).toEqual([]);
  });

  it("maps a subject back to the entity it was issued to, including revocation state", () => {
    const { service } = newService();
    const issued = service.issue(validRequest());
    service.revoke(issued.claims.credentialId);

    const records = service.lookup(issued.claims.subject);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      entityRef: "kyc-case-0001",
      issuedAt: NOW,
      revokedAt: NOW,
    });
    expect(service.lookup(999n)).toEqual([]);
  });
});

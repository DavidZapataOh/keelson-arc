import { identifierHash } from "@keelson/lists";
import {
  holdCredential,
  type IssuedCredential,
  issuerFromKey,
  SortedTree,
  subjectOf,
} from "@keelson/sdk";
import { IssuerService } from "../src/service.ts";
import { Store } from "../src/store.ts";

export const NOW = 1_800_000_000;
export const issuer = issuerFromKey(new Uint8Array(32).fill(7));

export const sanctionedAddress = "0x252a8bd2319d8a555b872990601221b3a2053bce";
export const sanctions = new SortedTree(8, [
  identifierHash({ kind: "address", value: sanctionedAddress }) as bigint,
  identifierHash({ kind: "id", value: "040070827" }) as bigint,
]);

export const holderSecret = 4242n;

export const validRequest = (overrides: Record<string, unknown> = {}) => ({
  subject: subjectOf(holderSecret),
  tier: 2,
  jurisdiction: 840,
  expiry: NOW + 90 * 24 * 3600,
  identifiers: [
    { kind: "id" as const, value: "LEI 5493001KJTIIGC8Y1R12" },
    { kind: "address" as const, value: "0x1111111111111111111111111111111111111111" },
  ],
  entityRef: "kyc-case-0001",
  ...overrides,
});

export const newService = (random?: (bytes: number) => Uint8Array) => {
  const store = new Store(":memory:");
  return { store, service: new IssuerService(issuer, store, sanctions, () => NOW, random) };
};

export const hold = (issued: IssuedCredential) => holdCredential(holderSecret, issued);

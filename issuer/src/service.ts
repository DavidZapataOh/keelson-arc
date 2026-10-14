import { randomBytes } from "node:crypto";
import type { Identifier } from "@keelson/lists";
import { identifierHash } from "@keelson/lists";
import {
  buildSetSnapshot,
  type Claims,
  IDENTIFIER_COUNT,
  type IssuedCredential,
  type Issuer,
  MAX_VALUE,
  REVOCATION_DEPTH,
  REVOCATIONS_FORMAT,
  type SetSnapshot,
  type SortedTree,
  signClaims,
} from "@keelson/sdk";
import type { CredentialRecord, Store } from "./store.ts";

export const MAX_VALIDITY_SECONDS = 366 * 24 * 60 * 60;

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type IssueRequest = {
  subject: bigint;
  tier: number;
  jurisdiction: number;
  expiry: number;
  identifiers: Identifier[];
  entityRef: string;
};

export class RequestError extends Error {}

export type Clock = () => number;

/** Signs credentials, keeps the revocation set and answers regulator lookups. */
export class IssuerService {
  private readonly issuer: Issuer;
  private readonly store: Store;
  private readonly sanctions: SortedTree;
  private readonly now: Clock;
  private readonly random: (bytes: number) => Uint8Array;

  constructor(
    issuer: Issuer,
    store: Store,
    sanctions: SortedTree,
    now: Clock = () => Math.floor(Date.now() / 1000),
    random: (bytes: number) => Uint8Array = randomBytes,
  ) {
    this.issuer = issuer;
    this.store = store;
    this.sanctions = sanctions;
    this.now = now;
    this.random = random;
  }

  get key() {
    return { Ax: this.issuer.Ax, Ay: this.issuer.Ay };
  }

  issue(request: IssueRequest): IssuedCredential {
    const now = this.now();
    if (request.subject <= 0n || request.subject >= FIELD)
      throw new RequestError("subject is not a field element");
    if (!Number.isInteger(request.tier) || request.tier < 0 || request.tier > 255) {
      throw new RequestError("tier must be an integer from 0 to 255");
    }
    if (
      !Number.isInteger(request.jurisdiction) ||
      request.jurisdiction < 1 ||
      request.jurisdiction > 999
    ) {
      throw new RequestError("jurisdiction must be an ISO 3166 numeric code");
    }
    if (
      !Number.isInteger(request.expiry) ||
      request.expiry <= now ||
      request.expiry > now + MAX_VALIDITY_SECONDS
    ) {
      throw new RequestError("expiry must be in the future and at most one year away");
    }
    if (request.identifiers.length !== IDENTIFIER_COUNT) {
      throw new RequestError(`exactly ${IDENTIFIER_COUNT} identifiers are required`);
    }
    if (request.entityRef.length === 0 || request.entityRef.length > 256) {
      throw new RequestError("entityRef must be 1 to 256 characters");
    }

    const identifiers = request.identifiers.map((identifier) => {
      const hash = identifierHash(identifier);
      if (hash === undefined)
        throw new RequestError("an identifier is empty or too short to screen");
      return hash;
    });
    for (const hash of identifiers) {
      if (this.sanctions.contains(hash))
        throw new RequestError("an identifier is on the sanctions list");
    }

    const claims: Claims = {
      subject: request.subject,
      credentialId: this.newCredentialId(),
      tier: BigInt(request.tier),
      jurisdiction: BigInt(request.jurisdiction),
      expiry: BigInt(request.expiry),
      identifiers,
    };
    this.store.insert({
      credentialId: claims.credentialId,
      subject: claims.subject,
      entityRef: request.entityRef,
      issuedAt: now,
      expiry: request.expiry,
    });
    return { claims, signature: signClaims(this.issuer, claims), issuerKey: this.key };
  }

  revoke(credentialId: bigint): boolean {
    return this.store.revoke(credentialId, this.now());
  }

  revocations(): SetSnapshot<{ updatedAt: number }> {
    return buildSetSnapshot(REVOCATIONS_FORMAT, this.store.revokedIds(), REVOCATION_DEPTH, {
      updatedAt: this.now(),
    }).snapshot;
  }

  lookup(subject: bigint): CredentialRecord[] {
    return this.store.bySubject(subject);
  }

  private newCredentialId(): bigint {
    for (;;) {
      const id = BigInt(`0x${Buffer.from(this.random(31)).toString("hex")}`);
      if (id > 0n && id < MAX_VALUE) return id;
    }
  }
}

import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { type Claims, issuedToJson, issuerFromKey, SortedTree, signClaims } from "@keelson/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ImportError,
  importIssued,
  requestPackage,
  statusOf,
} from "../src/credential/credential.ts";
import type { VaultRecord, VaultStore } from "../src/vault/store.ts";
import { createVault, type Vault } from "../src/vault/vault.ts";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

const memory = (): VaultStore => {
  let record: VaultRecord | undefined;
  return {
    read: async () => record,
    write: async (next) => {
      record = next;
    },
  };
};

const issuer = issuerFromKey(new Uint8Array(32).fill(7));
const NOW = 1_800_000_000;

const issue = (vault: Vault, overrides: Partial<Claims> = {}) => {
  const claims: Claims = {
    subject: vault.subject,
    credentialId: 12345n,
    tier: 2n,
    jurisdiction: 840n,
    expiry: BigInt(NOW + 86_400),
    identifiers: [111n, 222n],
    ...overrides,
  };
  return {
    claims,
    signature: signClaims(issuer, claims),
    issuerKey: { Ax: issuer.Ax, Ay: issuer.Ay },
  };
};

const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error instanceof ImportError ? error.message : `other: ${error}`;
  }
  return "none";
};

describe("credential", () => {
  it("asks the issuer with the subject only", async () => {
    const vault = await createVault("a long enough passphrase", memory());
    const request = requestPackage(vault);
    expect(Object.keys(request)).toEqual(["subject"]);
    expect(request.subject).toBe(vault.subject.toString());
    expect(JSON.stringify(request)).not.toContain(vault.secret().toString());
  });

  it("imports a credential the issuer signed for this vault and keeps it", async () => {
    const vault = await createVault("a long enough passphrase", memory());
    const held = await importIssued(vault, JSON.stringify(issuedToJson(issue(vault))));
    expect(held.credential.credentialId).toBe(12345n);
    expect(vault.credentials()).toHaveLength(1);
    await importIssued(vault, JSON.stringify(issuedToJson(issue(vault))));
    expect(vault.credentials()).toHaveLength(1);
  });

  it("refuses a credential for another holder", async () => {
    const vault = await createVault("a long enough passphrase", memory());
    const other = await createVault("another long passphrase", memory());
    const message = await failure(() =>
      importIssued(vault, JSON.stringify(issuedToJson(issue(other)))),
    );
    expect(message).toMatch(/different holder secret/);
    expect(vault.credentials()).toHaveLength(0);
  });

  it("refuses a credential whose signature does not match its claims", async () => {
    const vault = await createVault("a long enough passphrase", memory());
    const forged = issue(vault);
    const json = issuedToJson({ ...forged, claims: { ...forged.claims, tier: 9n } });
    expect(await failure(() => importIssued(vault, JSON.stringify(json)))).toMatch(/signature/);
  });

  it("refuses input that is not a credential", async () => {
    const vault = await createVault("a long enough passphrase", memory());
    expect(await failure(() => importIssued(vault, "nope"))).toMatch(/not JSON/);
    expect(await failure(() => importIssued(vault, "{}"))).toMatch(/not a Keelson credential/);
    const json = issuedToJson(issue(vault)) as { claims: Record<string, unknown> };
    json.claims.tier = 2;
    expect(await failure(() => importIssued(vault, JSON.stringify(json)))).toMatch(
      /decimal string/,
    );
  });

  it("reports valid, expired, revoked and unknown", async () => {
    const vault = await createVault("a long enough passphrase", memory());
    const held = await importIssued(vault, JSON.stringify(issuedToJson(issue(vault))));
    const empty = new SortedTree(16, []);
    const revoked = new SortedTree(16, [12345n]);
    expect(statusOf(held, empty, NOW)).toBe("valid");
    expect(statusOf(held, revoked, NOW)).toBe("revoked");
    expect(statusOf(held, empty, NOW + 86_400)).toBe("expired");
    expect(statusOf(held, undefined, NOW)).toBe("unknown");
  });
});

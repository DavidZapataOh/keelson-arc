import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { ITERATIONS } from "../src/vault/crypto.ts";
import { browserStore, type VaultRecord, type VaultStore } from "../src/vault/store.ts";
import { createVault, importBackup, unlock, VaultError, vaultExists } from "../src/vault/vault.ts";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

const memory = (): VaultStore & { writes: VaultRecord[] } => {
  let record: VaultRecord | undefined;
  const writes: VaultRecord[] = [];
  return {
    writes,
    read: async () => record,
    write: async (next) => {
      record = next;
      writes.push(next);
    },
  };
};

const code = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof VaultError) return error.code;
    throw error;
  }
  return "none";
};

describe("vault", () => {
  it("creates a vault and unlocks it with the same passphrase", async () => {
    const store = memory();
    const created = await createVault("correct horse battery staple", store);
    const opened = await unlock("correct horse battery staple", store);
    expect(opened.secret()).toBe(created.secret());
    expect(opened.subject).toBe(created.subject);
    expect(opened.secret() > 0n).toBe(true);
  });

  it("does not store the secret in the clear", async () => {
    const store = memory();
    const vault = await createVault("a long enough passphrase", store);
    const stored = JSON.stringify(store.writes[0]);
    expect(stored).not.toContain(vault.secret().toString());
    expect(store.writes[0]?.iterations).toBeGreaterThanOrEqual(ITERATIONS);
  });

  it("rejects a wrong passphrase and a corrupted record", async () => {
    const store = memory();
    await createVault("the right passphrase", store);
    expect(await code(() => unlock("the wrong passphrase", store))).toBe("wrong-passphrase");

    const record = store.writes[0] as VaultRecord;
    const flipped = { ...record, data: `${record.data.slice(0, -4)}AAAA` };
    const damaged = memory();
    await damaged.write(flipped);
    expect(await code(() => unlock("the right passphrase", damaged))).toBe("wrong-passphrase");

    const garbage = memory();
    await garbage.write({ ...record, salt: 5 } as unknown as VaultRecord);
    expect(await code(() => unlock("the right passphrase", garbage))).toBe("corrupt");
  });

  it("refuses a record from a newer format or with weak key stretching", async () => {
    const store = memory();
    await createVault("the right passphrase", store);
    const record = store.writes[0] as VaultRecord;

    const newer = memory();
    await newer.write({ ...record, v: 2 } as unknown as VaultRecord);
    expect(await code(() => unlock("the right passphrase", newer))).toBe("unsupported");

    const weak = memory();
    await weak.write({ ...record, iterations: 1000 });
    expect(await code(() => unlock("the right passphrase", weak))).toBe("corrupt");
  });

  it("never reuses a nonce across writes", async () => {
    const store = memory();
    const vault = await createVault("the right passphrase", store);
    await vault.remove(1n);
    await vault.remove(2n);
    const nonces = store.writes.map((w) => w.nonce);
    expect(new Set(nonces).size).toBe(nonces.length);
    expect(nonces.length).toBe(3);
  });

  it("refuses to create a second vault over an existing one", async () => {
    const store = memory();
    await createVault("the right passphrase", store);
    expect(await code(() => createVault("another passphrase", store))).toBe("exists");
    expect(await vaultExists(store)).toBe(true);
  });

  it("wipes its secrets from memory when locked", async () => {
    const vault = await createVault("the right passphrase", memory());
    vault.lock();
    expect(() => vault.secret()).toThrow(VaultError);
    expect(vault.credentials()).toEqual([]);
  });

  it("round-trips through a backup file into an empty store", async () => {
    const source = memory();
    const original = await createVault("the right passphrase", source);
    const backup = original.exportBackup();

    const target = memory();
    expect(await code(() => importBackup(backup, "the wrong passphrase", target))).toBe(
      "wrong-passphrase",
    );
    expect(await vaultExists(target)).toBe(false);

    const restored = await importBackup(backup, "the right passphrase", target);
    expect(restored.secret()).toBe(original.secret());
    expect((await unlock("the right passphrase", target)).secret()).toBe(original.secret());
    expect(await code(() => importBackup(backup, "the right passphrase", target))).toBe("exists");
    expect(await code(() => importBackup(new Blob(["nope"]), "x", memory()))).toBe("corrupt");
  });

  it("persists through the browser store", async () => {
    const vault = await createVault("the right passphrase", browserStore);
    expect((await unlock("the right passphrase", browserStore)).secret()).toBe(vault.secret());
  });
});

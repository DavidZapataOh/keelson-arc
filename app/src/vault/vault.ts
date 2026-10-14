import {
  type HeldCredential,
  holdCredential,
  type IssuedCredential,
  issuedFromJson,
  issuedToJson,
  newSecret,
  subjectOf,
} from "@keelson/sdk";
import {
  decrypt,
  deriveKey,
  encrypt,
  fromBase64,
  ITERATIONS,
  randomBytes,
  toBase64,
} from "./crypto.ts";
import { browserStore, type VaultRecord, type VaultStore } from "./store.ts";

export type VaultFailure = "exists" | "missing" | "wrong-passphrase" | "corrupt" | "unsupported";

export class VaultError extends Error {
  readonly code: VaultFailure;

  constructor(code: VaultFailure, message: string) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

type Plain = { secret: string; credentials: unknown[] };

export type Vault = {
  /** The public subject the issuer binds a credential to. */
  readonly subject: bigint;
  secret(): bigint;
  credentials(): HeldCredential[];
  add(issued: IssuedCredential): Promise<HeldCredential>;
  remove(credentialId: bigint): Promise<void>;
  exportBackup(): Blob;
  lock(): void;
};

export const vaultExists = async (store: VaultStore = browserStore) =>
  (await store.read()) !== undefined;

async function open(
  record: VaultRecord,
  key: CryptoKey,
  salt: string,
  store: VaultStore,
): Promise<Vault> {
  let plain: Plain;
  try {
    plain = JSON.parse(await decrypt(key, record.nonce, record.data)) as Plain;
    BigInt(plain.secret);
    if (!Array.isArray(plain.credentials)) throw new Error("shape");
  } catch {
    throw new VaultError("wrong-passphrase", "the passphrase is wrong or the vault is damaged");
  }

  let secret: bigint | undefined = BigInt(plain.secret);
  let held: HeldCredential[] = [];
  let current = record;
  const issued: IssuedCredential[] = [];
  try {
    for (const item of plain.credentials) {
      const credential = issuedFromJson(item);
      held.push(holdCredential(secret, credential));
      issued.push(credential);
    }
  } catch {
    throw new VaultError("corrupt", "a stored credential does not match the vault");
  }

  const persist = async () => {
    if (secret === undefined) throw new VaultError("missing", "the vault is locked");
    const body: Plain = { secret: secret.toString(), credentials: issued.map(issuedToJson) };
    const sealed = await encrypt(key, JSON.stringify(body));
    current = { v: 1, salt, iterations: record.iterations, ...sealed };
    await store.write(current);
  };
  const unlocked = () => {
    if (secret === undefined) throw new VaultError("missing", "the vault is locked");
    return secret;
  };

  return {
    subject: subjectOf(secret),
    secret: unlocked,
    credentials: () => [...held],
    async add(credential) {
      const next = holdCredential(unlocked(), credential);
      const id = credential.claims.credentialId;
      const at = issued.findIndex((item) => item.claims.credentialId === id);
      if (at >= 0) {
        issued[at] = credential;
        held[at] = next;
      } else {
        issued.push(credential);
        held.push(next);
      }
      await persist();
      return next;
    },
    async remove(credentialId) {
      unlocked();
      const keep = issued.flatMap((item, i) =>
        item.claims.credentialId === credentialId ? [] : [i],
      );
      const nextIssued = keep.map((i) => issued[i] as IssuedCredential);
      const nextHeld = keep.map((i) => held[i] as HeldCredential);
      issued.length = 0;
      issued.push(...nextIssued);
      held = nextHeld;
      await persist();
    },
    exportBackup: () => new Blob([JSON.stringify(current)], { type: "application/json" }),
    lock() {
      secret = undefined;
      held = [];
      issued.length = 0;
    },
  };
}

const parseRecord = (value: unknown): VaultRecord => {
  const r = value as Partial<VaultRecord> | null;
  if (!r || typeof r !== "object") throw new VaultError("corrupt", "the vault record is damaged");
  if (r.v !== 1) throw new VaultError("unsupported", "the vault was written by a newer version");
  if (
    typeof r.salt !== "string" ||
    typeof r.nonce !== "string" ||
    typeof r.data !== "string" ||
    !Number.isSafeInteger(r.iterations) ||
    (r.iterations as number) < ITERATIONS
  ) {
    throw new VaultError("corrupt", "the vault record is damaged");
  }
  return r as VaultRecord;
};

export async function createVault(
  passphrase: string,
  store: VaultStore = browserStore,
): Promise<Vault> {
  if (await store.read()) throw new VaultError("exists", "a vault already exists on this device");
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const body: Plain = { secret: newSecret().toString(), credentials: [] };
  const sealed = await encrypt(key, JSON.stringify(body));
  const record: VaultRecord = { v: 1, salt: toBase64(salt), iterations: ITERATIONS, ...sealed };
  await store.write(record);
  return open(record, key, record.salt, store);
}

export async function unlock(passphrase: string, store: VaultStore = browserStore): Promise<Vault> {
  const stored = await store.read();
  if (!stored) throw new VaultError("missing", "there is no vault on this device");
  const record = parseRecord(stored);
  const key = await deriveKey(passphrase, fromBase64(record.salt), record.iterations);
  return open(record, key, record.salt, store);
}

/** Restores a backup file into an empty store, after checking the passphrase opens it. */
export async function importBackup(
  backup: Blob,
  passphrase: string,
  store: VaultStore = browserStore,
): Promise<Vault> {
  if (await store.read()) throw new VaultError("exists", "a vault already exists on this device");
  let record: VaultRecord;
  try {
    record = parseRecord(JSON.parse(await backup.text()));
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError("corrupt", "the backup file is not a Keelson vault");
  }
  const key = await deriveKey(passphrase, fromBase64(record.salt), record.iterations);
  const vault = await open(record, key, record.salt, store);
  await store.write(record);
  return vault;
}

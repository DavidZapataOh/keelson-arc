import { DatabaseSync } from "node:sqlite";

export type CredentialRecord = {
  credentialId: string;
  subject: string;
  entityRef: string;
  issuedAt: number;
  expiry: number;
  revokedAt: number | null;
};

const hex = (value: bigint) => `0x${value.toString(16).padStart(62, "0")}`;

/** Durable record of every credential this issuer has signed and which of them are revoked. */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS credentials (
        credential_id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        entity_ref TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expiry INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS credentials_subject ON credentials (subject);
    `);
  }

  insert(record: {
    credentialId: bigint;
    subject: bigint;
    entityRef: string;
    issuedAt: number;
    expiry: number;
  }) {
    this.db
      .prepare(
        "INSERT INTO credentials (credential_id, subject, entity_ref, issued_at, expiry) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        hex(record.credentialId),
        record.subject.toString(),
        record.entityRef,
        record.issuedAt,
        record.expiry,
      );
  }

  /** Marks a credential revoked. Returns false if it does not exist; revoking twice keeps the first time. */
  revoke(credentialId: bigint, at: number): boolean {
    const result = this.db
      .prepare(
        "UPDATE credentials SET revoked_at = COALESCE(revoked_at, ?) WHERE credential_id = ?",
      )
      .run(at, hex(credentialId));
    return result.changes > 0;
  }

  revokedIds(): bigint[] {
    const rows = this.db
      .prepare("SELECT credential_id FROM credentials WHERE revoked_at IS NOT NULL")
      .all() as { credential_id: string }[];
    return rows.map((row) => BigInt(row.credential_id));
  }

  bySubject(subject: bigint): CredentialRecord[] {
    const rows = this.db
      .prepare(
        "SELECT credential_id, subject, entity_ref, issued_at, expiry, revoked_at FROM credentials WHERE subject = ? ORDER BY issued_at",
      )
      .all(subject.toString()) as {
      credential_id: string;
      subject: string;
      entity_ref: string;
      issued_at: number;
      expiry: number;
      revoked_at: number | null;
    }[];
    return rows.map((row) => ({
      credentialId: row.credential_id,
      subject: row.subject,
      entityRef: row.entity_ref,
      issuedAt: row.issued_at,
      expiry: row.expiry,
      revokedAt: row.revoked_at,
    }));
  }

  close() {
    this.db.close();
  }
}

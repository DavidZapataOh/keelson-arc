import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ImportError, importIssued, requestPackage, statusFrom } from "../credential/credential.ts";
import { download } from "../export/transaction.ts";
import { useListsContext } from "../lists/context.tsx";
import { useVault } from "../vault/context.tsx";
import {
  createVault,
  importBackup,
  unlock,
  type Vault,
  VaultError,
  vaultExists,
} from "../vault/vault.ts";

const MIN_PASSPHRASE = 12;

const WARNING =
  "Your secret is created in this browser and never leaves it. Keelson cannot recover it: if you lose this device and your backup, you must ask your issuer for a new credential.";

export function Credential() {
  const { vault, open, lock } = useVault();
  const [stored, setStored] = useState<"checking" | "none" | "locked">("checking");

  useEffect(() => {
    void vaultExists().then((exists) => setStored(exists ? "locked" : "none"));
  }, []);

  return (
    <section className="page" aria-labelledby="credential-title">
      <h1 id="credential-title">Credential</h1>
      {vault ? (
        <Held
          vault={vault}
          onLock={() => {
            lock();
            setStored("locked");
          }}
        />
      ) : stored === "checking" ? (
        <p className="mono">Opening…</p>
      ) : stored === "none" ? (
        <Create onOpen={open} />
      ) : (
        <Locked onOpen={open} />
      )}
    </section>
  );
}

function useAction() {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    setError(undefined);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof VaultError || cause instanceof ImportError
          ? cause.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, []);
  return { error, busy, run };
}

function Create({ onOpen }: { onOpen: (vault: Vault) => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [file, setFile] = useState<File>();
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const create = useAction();
  const restore = useAction();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void create.run(async () => {
      if (passphrase.length < MIN_PASSPHRASE) {
        throw new VaultError(
          "corrupt",
          `Use a passphrase of at least ${MIN_PASSPHRASE} characters.`,
        );
      }
      if (passphrase !== confirm) throw new VaultError("corrupt", "The two passphrases differ.");
      onOpen(await createVault(passphrase));
    });
  };

  return (
    <div className="stack">
      <p className="lede">{WARNING}</p>
      <form className="panel" onSubmit={submit}>
        <h2>Create your vault</h2>
        <label htmlFor="pass">Passphrase</label>
        <input
          id="pass"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <label htmlFor="pass2">Repeat the passphrase</label>
        <input
          id="pass2"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <p className="hint">
          At least {MIN_PASSPHRASE} characters. It encrypts the vault on this device.
        </p>
        {create.error && (
          <p className="error" role="alert">
            {create.error}
          </p>
        )}
        <button type="submit" className="btn" disabled={create.busy}>
          {create.busy ? "Creating…" : "Create the vault"}
        </button>
      </form>

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (!file) return;
          void restore.run(async () => onOpen(await importBackup(file, restorePassphrase)));
        }}
      >
        <h2>Restore from a backup</h2>
        <label htmlFor="backup">Backup file</label>
        <input
          id="backup"
          type="file"
          accept="application/json"
          onChange={(e) => setFile(e.target.files?.[0])}
        />
        <label htmlFor="restore-pass">Passphrase of the backup</label>
        <input
          id="restore-pass"
          type="password"
          autoComplete="current-password"
          value={restorePassphrase}
          onChange={(e) => setRestorePassphrase(e.target.value)}
        />
        {restore.error && (
          <p className="error" role="alert">
            {restore.error}
          </p>
        )}
        <button type="submit" className="btn btn-outline" disabled={restore.busy || !file}>
          {restore.busy ? "Restoring…" : "Restore the vault"}
        </button>
      </form>
    </div>
  );
}

function Locked({ onOpen }: { onOpen: (vault: Vault) => void }) {
  const [passphrase, setPassphrase] = useState("");
  const action = useAction();
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => onOpen(await unlock(passphrase)));
      }}
    >
      <h2>Unlock your vault</h2>
      <label htmlFor="unlock">Passphrase</label>
      <input
        id="unlock"
        type="password"
        autoComplete="current-password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
      />
      {action.error && (
        <p className="error" role="alert">
          {action.error}
        </p>
      )}
      <button type="submit" className="btn" disabled={action.busy}>
        {action.busy ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}

const dateOf = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString().slice(0, 10);

const STATUS_TEXT = {
  valid: "Valid",
  expired: "Expired",
  revoked: "Revoked",
  unknown: "Status unknown",
} as const;

function Held({ vault, onLock }: { vault: Vault; onLock: () => void }) {
  const { state, engine } = useListsContext();
  const [credentials, setCredentials] = useState(() => vault.credentials());
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState<boolean[]>();
  const action = useAction();

  useEffect(() => {
    if (state.phase !== "ready" || credentials.length === 0) {
      setRevoked(undefined);
      return;
    }
    let live = true;
    engine
      .revoked(credentials.map((held) => held.credential.credentialId))
      .then((flags) => live && setRevoked(flags))
      .catch(() => live && setRevoked(undefined));
    return () => {
      live = false;
    };
  }, [state, engine, credentials]);

  const copySubject = async () => {
    await navigator.clipboard.writeText(requestPackage(vault).subject);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="stack">
      <div className="panel">
        <h2>Your subject</h2>
        <p className="lede">
          Send this to your issuer to request a credential. It is public and reveals nothing about
          your secret.
        </p>
        <p className="subject mono">{requestPackage(vault).subject}</p>
        <div className="actions">
          <button type="button" className="btn btn-outline" onClick={() => void copySubject()}>
            {copied ? "Copied" : "Copy the subject"}
          </button>
        </div>
      </div>

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await importIssued(vault, text);
            setCredentials(vault.credentials());
            setText("");
          });
        }}
      >
        <h2>Import a credential</h2>
        <label htmlFor="issued">Credential from your issuer</label>
        <textarea
          id="issued"
          className="mono"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        {action.error && (
          <p className="error" role="alert">
            {action.error}
          </p>
        )}
        <button type="submit" className="btn" disabled={action.busy || text.trim() === ""}>
          Import
        </button>
      </form>

      <ul className="credentials" aria-label="Held credentials">
        {credentials.length === 0 && <li className="note">No credential yet.</li>}
        {credentials.map((held, i) => {
          const status = statusFrom(held, revoked?.[i], now);
          return (
            <li key={held.credential.credentialId.toString()} data-status={status}>
              <span className={`mark ${status}`} aria-hidden="true" />
              <div className="cred-main">
                <h3>Tier {held.credential.tier.toString()}</h3>
                <p className="note">
                  Jurisdiction {held.credential.jurisdiction.toString()}, expires{" "}
                  {dateOf(held.credential.expiry)}
                </p>
              </div>
              <div className="redacted" role="img" aria-label="Identifiers are private">
                <span className="bar" />
                <span className="bar short" />
              </div>
              <p className={`state ${status}`}>{STATUS_TEXT[status]}</p>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  void vault
                    .remove(held.credential.credentialId)
                    .then(() => setCredentials(vault.credentials()))
                }
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <div className="actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            const blob = vault.exportBackup();
            void blob.text().then((body) => download("keelson-vault-backup.json", body));
          }}
        >
          Download a backup
        </button>
        <button type="button" className="btn btn-outline" onClick={onLock}>
          Lock the vault
        </button>
      </div>
    </div>
  );
}

import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { issuedToJson, issuerFromKey, signClaims, subjectOf } from "@keelson/sdk";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import type { Chain } from "../src/state/context.tsx";
import { fakeEngine } from "./support/engine.ts";
import { FILE, fakeChain } from "./support/fakeChain.ts";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

const chain =
  (versions = { issuers: 1n, sanctions: 7n, revocations: 0n }): (() => Promise<Chain>) =>
  async () => ({ file: FILE, client: fakeChain({ versions }) });

const engine = (options: { revoked?: boolean; fail?: string } = {}) => fakeEngine(options);

async function openAt(route: string, load = chain(), makeEngine = engine()) {
  window.location.hash = `#/${route}`;
  const user = userEvent.setup();
  render(<App load={load} makeEngine={makeEngine} />);
  await user.type(
    await screen.findByLabelText(/read-only address/i),
    "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  );
  await user.click(screen.getByRole("button", { name: /open read-only/i }));
  return user;
}

beforeEach(() => {
  indexedDB.deleteDatabase("keelson");
});

describe("lists page", () => {
  it("shows each list with whether the contract accepts it", async () => {
    await openAt("lists");
    const rows = await screen.findAllByRole("listitem");
    const text = (name: string) => rows.find((row) => within(row).queryByText(name))?.textContent;
    expect(text("Issuers")).toMatch(/Accepted by the contract/);
    expect(text("Sanctions")).toMatch(/Accepted by the contract/);
    expect(text("Sanctions")).toMatch(/Issued 2026-10-13/);
    expect(text("Revocations")).toMatch(/Not accepted/);
  });

  it("shows why the lists could not be opened and retries", async () => {
    const user = await openAt(
      "lists",
      chain(),
      engine({ fail: "the sanctions list could not be reached" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /sanctions list could not be reached/,
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

const issuer = issuerFromKey(new Uint8Array(32).fill(7));
const issuedFor = (subject: bigint, expiry = BigInt(Math.floor(Date.now() / 1000) + 86_400)) => {
  const claims = {
    subject,
    credentialId: 4242n,
    tier: 2n,
    jurisdiction: 840n,
    expiry,
    identifiers: [11n, 22n],
  };
  return JSON.stringify(
    issuedToJson({
      claims,
      signature: signClaims(issuer, claims),
      issuerKey: { Ax: issuer.Ax, Ay: issuer.Ay },
    }),
  );
};

async function createVaultUi(
  user: ReturnType<typeof userEvent.setup>,
  passphrase = "a long enough passphrase",
) {
  await user.type(await screen.findByLabelText("Passphrase"), passphrase);
  await user.type(screen.getByLabelText(/repeat the passphrase/i), passphrase);
  await user.click(screen.getByRole("button", { name: /create the vault/i }));
  return screen.findByText(/your subject/i);
}

describe("credential page", () => {
  it("warns about loss and validates the passphrase before creating the vault", async () => {
    const user = await openAt("credential");
    expect(await screen.findByText(/cannot recover it/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Passphrase"), "short");
    await user.type(screen.getByLabelText(/repeat the passphrase/i), "short");
    await user.click(screen.getByRole("button", { name: /create the vault/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 12/i);

    await user.clear(screen.getByLabelText("Passphrase"));
    await user.clear(screen.getByLabelText(/repeat the passphrase/i));
    await user.type(screen.getByLabelText("Passphrase"), "a long enough passphrase");
    await user.type(screen.getByLabelText(/repeat the passphrase/i), "another long passphrase");
    await user.click(screen.getByRole("button", { name: /create the vault/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/differ/i);
  }, 30_000);

  it("imports a credential, shows its status and hides its identifiers", async () => {
    const user = await openAt("credential");
    await createVaultUi(user);
    const subject = screen.getByText(/^\d{20,}$/).textContent as string;
    await user.click(screen.getByLabelText("Credential from your issuer"));
    await user.paste(issuedFor(BigInt(subject)));
    await user.click(screen.getByRole("button", { name: /^import$/i }));

    const list = await screen.findByRole("list", { name: /held credentials/i });
    expect(await within(list).findByText("Tier 2")).toBeInTheDocument();
    expect(await within(list).findByText("Valid")).toBeInTheDocument();
    expect(within(list).getByLabelText(/identifiers are private/i)).toBeInTheDocument();
    expect(list).not.toHaveTextContent("11");
  }, 30_000);

  it("shows a revoked credential as revoked", async () => {
    const user = await openAt("credential", chain(), engine({ revoked: true }));
    await createVaultUi(user);
    const subject = screen.getByText(/^\d{20,}$/).textContent as string;
    await user.click(screen.getByLabelText("Credential from your issuer"));
    await user.paste(issuedFor(BigInt(subject)));
    await user.click(screen.getByRole("button", { name: /^import$/i }));
    expect(await screen.findByText("Revoked")).toBeInTheDocument();
  }, 30_000);

  it("refuses a credential for someone else with a plain message", async () => {
    const user = await openAt("credential");
    await createVaultUi(user);
    await user.click(screen.getByLabelText("Credential from your issuer"));
    await user.paste(issuedFor(subjectOf(5n)));
    await user.click(screen.getByRole("button", { name: /^import$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/different holder secret/i);
  }, 30_000);

  it("locks and unlocks, and a wrong passphrase says so", async () => {
    const user = await openAt("credential");
    await createVaultUi(user);
    await user.click(screen.getByRole("button", { name: /lock the vault/i }));
    await user.type(await screen.findByLabelText("Passphrase"), "the wrong passphrase");
    await user.click(screen.getByRole("button", { name: /^unlock$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/passphrase is wrong/i);
    await user.clear(screen.getByLabelText("Passphrase"));
    await user.type(screen.getByLabelText("Passphrase"), "a long enough passphrase");
    await user.click(screen.getByRole("button", { name: /^unlock$/i }));
    expect(await screen.findByText(/your subject/i)).toBeInTheDocument();
  }, 30_000);

  it("restores a vault from a backup file", async () => {
    const created = await openAt("credential");
    await createVaultUi(created);
    const subject = screen.getByText(/^\d{20,}$/).textContent as string;

    const save = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    let body = "";
    const originalBlob = globalThis.Blob;
    globalThis.Blob = class extends originalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        body = String(parts?.[0] ?? "");
      }
    } as typeof Blob;
    await created.click(screen.getByRole("button", { name: /download a backup/i }));
    await waitFor(() => expect(body).not.toBe(""));
    globalThis.Blob = originalBlob;
    save.mockRestore();

    document.body.innerHTML = "";
    indexedDB.deleteDatabase("keelson");
    const user = await openAt("credential");
    const file = new File([body], "keelson-vault-backup.json", { type: "application/json" });
    await user.upload(await screen.findByLabelText("Backup file"), file);
    await user.type(screen.getByLabelText(/passphrase of the backup/i), "a long enough passphrase");
    await user.click(screen.getByRole("button", { name: /restore the vault/i }));
    expect(await screen.findByText(subject)).toBeInTheDocument();
  }, 40_000);
});

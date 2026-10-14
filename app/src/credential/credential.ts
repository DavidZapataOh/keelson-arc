import type { SortedTree } from "@keelson/sdk";
import { type HeldCredential, issuedFromJson } from "@keelson/sdk";
import type { Vault } from "../vault/vault.ts";

export type CredentialStatus = "valid" | "expired" | "revoked";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/** What the holder sends the issuer: only the public subject, never the secret. */
export const requestPackage = (vault: Vault): { subject: string } => ({
  subject: vault.subject.toString(),
});

export async function importIssued(vault: Vault, text: string): Promise<HeldCredential> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError("That is not JSON. Paste the credential exactly as the issuer sent it.");
  }
  let issued: ReturnType<typeof issuedFromJson>;
  try {
    issued = issuedFromJson(json);
  } catch (cause) {
    throw new ImportError(`That is not a Keelson credential: ${(cause as Error).message}.`);
  }
  try {
    return await vault.add(issued);
  } catch (cause) {
    const message = (cause as Error).message;
    if (message.includes("another subject")) {
      throw new ImportError(
        "This credential was issued to a different holder secret than this vault.",
      );
    }
    if (message.includes("signature")) {
      throw new ImportError("The issuer signature on this credential is not valid.");
    }
    throw cause;
  }
}

export function statusFrom(
  held: HeldCredential,
  revoked: boolean | undefined,
  now: number,
): CredentialStatus | "unknown" {
  if (held.credential.expiry <= BigInt(now)) return "expired";
  if (revoked === undefined) return "unknown";
  return revoked ? "revoked" : "valid";
}

export const statusOf = (
  held: HeldCredential,
  revocations: SortedTree | undefined,
  now: number,
): CredentialStatus | "unknown" =>
  statusFrom(held, revocations?.contains(held.credential.credentialId), now);

import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import { BaseError, decodeErrorResult, type Hex, isHex, UserRejectedRequestError } from "viem";

export const SENTENCES: Record<string, string> = {
  NotCompliant: "A party has no valid proof for this trade. Generate the proof again and retry.",
  AlreadySettled: "This trade is already settled.",
  Expired: "This trade has expired.",
  CommitmentMismatch:
    "The two commitments are not to the same terms. Check the link with the other party.",
  SamePartyOnBothSides: "The seller and the buyer are the same address.",
  NullifierUsed: "This credential was already used to prove for this trade.",
  RootNotAccepted: "A list changed while you were proving. Download the lists again and retry.",
  InvalidProof: "The contract rejected the proof. Generate it again.",
  TierTooLow: "Your credential tier is below what this deployment requires.",
  ProofNotCurrent: "The proof is too old. Generate it again.",
  WrongRegulatorKey: "The regulator key changed. Generate the proof again.",
  AddressOutOfRange: "This address cannot be proven for.",
  ERC20InsufficientAllowance: "The approval does not cover this trade. Approve the token first.",
  ERC20InsufficientBalance: "The balance does not cover this trade.",
  SafeERC20FailedOperation: "The token transfer would fail. Check the approval and the balance.",
};

export type Explained =
  | { kind: "rejected" }
  | { kind: "reverted"; name: string; message: string }
  | { kind: "other"; message: string };

const ABIS = [...complianceRegistryAbi, ...settlementAbi];

const hexOf = (value: unknown): Hex | undefined => {
  if (typeof value === "string" && isHex(value)) return value;
  const inner = (value as { data?: unknown } | null | undefined)?.data;
  return typeof inner === "string" && isHex(inner) ? inner : undefined;
};

function revertName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const carrier = error.walk((cause) => {
    const data = hexOf((cause as { data?: unknown }).data);
    return data !== undefined && data.length >= 10;
  });
  const data = hexOf((carrier as { data?: unknown } | null)?.data);
  if (!data) return undefined;
  try {
    return decodeErrorResult({ abi: ABIS, data }).errorName;
  } catch {
    return undefined;
  }
}

export function explain(error: unknown): Explained {
  const code = (error as { code?: number } | null)?.code;
  if (
    code === 4001 ||
    (error instanceof BaseError && error.walk((cause) => cause instanceof UserRejectedRequestError))
  ) {
    return { kind: "rejected" };
  }
  const name = revertName(error);
  if (name) {
    return {
      kind: "reverted",
      name,
      message: SENTENCES[name] ?? "The transaction would fail on chain.",
    };
  }
  const short =
    error instanceof BaseError ? error.shortMessage : (error as Error | undefined)?.message;
  return {
    kind: "other",
    message: short
      ? `The transaction could not be sent: ${short}`
      : "The transaction could not be sent.",
  };
}

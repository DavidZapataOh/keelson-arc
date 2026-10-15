import type { Terms } from "@keelson/sdk/trade";
import type { LegState, Role, TradeState } from "../trade/state.ts";

export type StepId = "credential" | "proof" | "approve" | "commit";
export type StepStatus = "done" | "current" | "waiting" | "blocked";
export type Step = { id: StepId; status: StepStatus; reason?: string };

export const STEP_LABELS: Record<StepId, string> = {
  credential: "Credential",
  proof: "Proof",
  approve: "Approve token",
  commit: "Commit",
};

type Context = {
  amount: bigint;
  own: boolean;
  hasCredential: boolean;
  expired: boolean;
  settled: boolean;
};

/** The four steps of one leg, derived only from the chain and, for the connected party, the vault. */
export function stepsOf(leg: LegState, context: Context): Step[] {
  const credentialDone = context.own ? context.hasCredential : leg.compliant;
  const done: Record<StepId, boolean> = {
    credential: context.settled || credentialDone || leg.compliant,
    proof: context.settled || leg.compliant,
    approve: context.settled || leg.allowance >= context.amount,
    commit: context.settled || leg.matches,
  };
  const blocked: Partial<Record<StepId, string>> = {};
  if (leg.committed && !leg.matches) blocked.commit = "Committed to different terms";
  if (!done.approve && leg.balance < context.amount) blocked.approve = "Balance is too low";
  const order: StepId[] = ["credential", "proof", "approve", "commit"];

  let currentTaken = false;
  return order.map((id): Step => {
    if (done[id]) return { id, status: "done" };
    if (context.expired) return { id, status: "blocked", reason: "The trade expired" };
    const reason = blocked[id];
    if (reason) return { id, status: "blocked", reason };
    if (context.own && !currentTaken) {
      currentTaken = true;
      return { id, status: "current" };
    }
    return { id, status: "waiting" };
  });
}

export type Readiness = { ready: boolean; reason?: string };

export function readiness(terms: Terms, state: TradeState): Readiness {
  if (state.settled) return { ready: false, reason: "Settled" };
  if (state.expired) return { ready: false, reason: "The trade expired" };
  const checks: [Role, bigint][] = [
    ["seller", terms.sellAmount],
    ["buyer", terms.payAmount],
  ];
  for (const [role, amount] of checks) {
    const leg = state.legs[role];
    if (!leg.compliant) return { ready: false, reason: `Waiting for the ${role}'s proof` };
    if (!leg.matches) return { ready: false, reason: `Waiting for the ${role}'s commitment` };
    if (leg.allowance < amount)
      return { ready: false, reason: `Waiting for the ${role}'s approval` };
    if (leg.balance < amount) return { ready: false, reason: `The ${role}'s balance is too low` };
  }
  return { ready: true };
}

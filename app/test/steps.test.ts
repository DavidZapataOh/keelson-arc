import { describe, expect, it } from "vitest";
import { readiness, stepsOf } from "../src/room/steps.ts";
import type { LegState, TradeState } from "../src/trade/state.ts";
import type { Terms } from "../src/trade/terms.ts";

const AMOUNT = 1000n;
const leg = (patch: Partial<LegState> = {}): LegState => ({
  compliant: false,
  committed: false,
  matches: false,
  allowance: 0n,
  balance: 5000n,
  ...patch,
});
const ctx = (patch = {}) => ({
  amount: AMOUNT,
  own: true,
  hasCredential: true,
  expired: false,
  settled: false,
  ...patch,
});
const status = (steps: ReturnType<typeof stepsOf>) => steps.map((s) => s.status);

describe("steps of a leg", () => {
  it("walks the connected leg one current step at a time", () => {
    expect(status(stepsOf(leg(), ctx({ hasCredential: false })))).toEqual([
      "current",
      "waiting",
      "waiting",
      "waiting",
    ]);
    expect(status(stepsOf(leg(), ctx()))).toEqual(["done", "current", "waiting", "waiting"]);
    expect(status(stepsOf(leg({ compliant: true }), ctx()))).toEqual([
      "done",
      "done",
      "current",
      "waiting",
    ]);
    expect(status(stepsOf(leg({ compliant: true, allowance: AMOUNT }), ctx()))).toEqual([
      "done",
      "done",
      "done",
      "current",
    ]);
    expect(
      status(
        stepsOf(leg({ compliant: true, allowance: AMOUNT, committed: true, matches: true }), ctx()),
      ),
    ).toEqual(["done", "done", "done", "done"]);
  });

  it("never marks a step current on the other party's leg and infers their credential from their proof", () => {
    expect(status(stepsOf(leg(), ctx({ own: false })))).toEqual([
      "waiting",
      "waiting",
      "waiting",
      "waiting",
    ]);
    expect(status(stepsOf(leg({ compliant: true }), ctx({ own: false })))).toEqual([
      "done",
      "done",
      "waiting",
      "waiting",
    ]);
  });

  it("blocks a commitment to other terms and an approval the balance cannot cover", () => {
    const wrong = stepsOf(
      leg({ compliant: true, allowance: AMOUNT, committed: true, matches: false }),
      ctx(),
    );
    expect(wrong[3]).toEqual({
      id: "commit",
      status: "blocked",
      reason: "Committed to different terms",
    });
    const poor = stepsOf(leg({ compliant: true, balance: 10n }), ctx());
    expect(poor[2]).toEqual({ id: "approve", status: "blocked", reason: "Balance is too low" });
  });

  it("blocks what is left when the trade expired and shows everything done once settled", () => {
    const expired = stepsOf(leg({ compliant: true }), ctx({ expired: true }));
    expect(status(expired)).toEqual(["done", "done", "blocked", "blocked"]);
    expect(status(stepsOf(leg(), ctx({ settled: true })))).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
  });
});

const terms = { sellAmount: 1000n, payAmount: 900n } as Terms;
const ready = (): TradeState => ({
  termsHash: "0x",
  legs: {
    seller: leg({ compliant: true, matches: true, committed: true, allowance: 1000n }),
    buyer: leg({ compliant: true, matches: true, committed: true, allowance: 900n }),
  },
  settled: false,
  expired: false,
  readAt: 0,
});

describe("readiness to settle", () => {
  it("is ready only when both legs are complete and funded", () => {
    expect(readiness(terms, ready())).toEqual({ ready: true });
  });

  it("names the first thing missing", () => {
    const state = ready();
    state.legs.buyer.matches = false;
    expect(readiness(terms, state).reason).toMatch(/buyer's commitment/);
    state.legs.buyer.matches = true;
    state.legs.seller.allowance = 999n;
    expect(readiness(terms, state).reason).toMatch(/seller's approval/);
    state.legs.seller.allowance = 1000n;
    state.legs.buyer.balance = 899n;
    expect(readiness(terms, state).reason).toMatch(/buyer's balance/);
    state.legs.buyer.balance = 900n;
    state.legs.seller.compliant = false;
    expect(readiness(terms, state).reason).toMatch(/seller's proof/);
  });

  it("is never ready once expired or settled", () => {
    expect(readiness(terms, { ...ready(), expired: true }).ready).toBe(false);
    expect(readiness(terms, { ...ready(), settled: true }).reason).toBe("Settled");
  });
});

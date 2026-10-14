import { useEffect, useState } from "react";
import { useApp } from "../state/context.tsx";
import type { TradePackage } from "../trade/package.ts";
import { type Role, roleOf, type TradeState, watchTrade } from "../trade/state.ts";
import { formatAmount } from "../trade/terms.ts";
import { useTokens } from "../trade/tokens.ts";
import { useVault } from "../vault/context.tsx";
import { LegCard } from "./LegCard.tsx";
import { readiness, stepsOf } from "./steps.ts";

const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;

function countdown(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h > 0) return `${h} h ${m} min`;
  return m > 0 ? `${m} min` : `${seconds} s`;
}

function useTrade(pkg: TradePackage) {
  const { chain } = useApp();
  const [state, setState] = useState<TradeState>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    setState(undefined);
    return watchTrade(
      chain,
      pkg,
      (next) => {
        setError(undefined);
        setState(next);
      },
      () => setError("The chain could not be read. Showing the last state."),
    );
  }, [chain, pkg]);
  return { state, error };
}

export function Room({ pkg }: { pkg: TradePackage }) {
  const { chain, session } = useApp();
  const { vault } = useVault();
  const { state, error } = useTrade(pkg);
  const tokens = useTokens(chain.client, [pkg.terms.sellToken, pkg.terms.payToken]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const { terms } = pkg;
  const sell = tokens.get(terms.sellToken.toLowerCase());
  const pay = tokens.get(terms.payToken.toLowerCase());
  const mine: Role | undefined = session ? roleOf(pkg, session.snapshot.address) : undefined;
  const hasCredential = Boolean(
    vault?.credentials().some((held) => held.credential.expiry > BigInt(now)),
  );

  const amountText = (value: bigint, token: typeof sell) =>
    token ? `${formatAmount(value, token.decimals)} ${token.symbol}` : "…";
  const remaining = state ? Number(terms.expiry) - Math.max(now, state.readAt) : undefined;
  const ready = state ? readiness(terms, state) : undefined;

  return (
    <section className="room" aria-labelledby="room-title">
      <header className="room-head">
        <div>
          <p className="label mono">Trade id</p>
          <p className="mono">{short(`0x${pkg.tradeId.toString(16)}`)}</p>
        </div>
        <h1 id="room-title" className="deal mono">
          <span className="sell">SELL</span> {amountText(terms.sellAmount, sell)}
          <span className="arrow" aria-hidden="true">
            →
          </span>
          <span className="sr">for</span> {amountText(terms.payAmount, pay)}
        </h1>
        <div className="expiry">
          <p className="label mono">Expires in</p>
          <p className="mono">{remaining === undefined ? "…" : countdown(remaining)}</p>
        </div>
      </header>

      {(sell?.verified === false || pay?.verified === false) && (
        <p className="note">
          A token could not be read from the chain, so amounts are shown in raw units.
        </p>
      )}

      {state?.settled && (
        <p className="banner" role="status">
          Settled. Both legs moved in one transaction.
        </p>
      )}
      {state?.expired && !state.settled && (
        <p className="banner warn" role="status">
          This trade expired. Nothing can be sent for it.
        </p>
      )}
      {session && !mine && (
        <p className="banner" role="status">
          This wallet is neither party of this trade. You are watching it.
        </p>
      )}
      {session?.kind === "readonly" && mine && (
        <p className="banner" role="status">
          Read-only: you can review every step. Sending needs a connected wallet or an exported
          transaction.
        </p>
      )}
      {error && (
        <p className="note" role="status">
          {error}
        </p>
      )}

      {state ? (
        <div className="legs">
          {(["seller", "buyer"] as const).map((role, i) => (
            <LegCard
              key={role}
              label={i === 0 ? "Leg A" : "Leg B"}
              role={role}
              address={terms[role]}
              you={mine === role}
              steps={stepsOf(state.legs[role], {
                amount: role === "seller" ? terms.sellAmount : terms.payAmount,
                own: mine === role,
                hasCredential,
                expired: state.expired,
                settled: state.settled,
              })}
            />
          ))}
          <div className={`beam ${ready?.ready ? "complete" : ""}`} aria-hidden="true">
            <i className="beam-left" />
            <i className="beam-right" />
            <i className="beam-down" />
          </div>
        </div>
      ) : (
        <p className="mono" role="status">
          Reading the trade from the chain…
        </p>
      )}

      {ready && (
        <p className={`settle-status ${ready.ready ? "ready" : ""}`} role="status">
          {ready.ready ? "Both legs are ready to settle." : ready.reason}
        </p>
      )}
    </section>
  );
}

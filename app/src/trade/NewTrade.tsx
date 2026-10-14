import { newSalt, newTradeId } from "@keelson/sdk/trade";
import { type FormEvent, useState } from "react";
import { type Address, isAddress } from "viem";
import { useApp } from "../state/context.tsx";
import { encodePackage, type TradePackage } from "./package.ts";
import { parseTerms, TermsError, type Token } from "./terms.ts";
import { KNOWN_TOKENS, readToken } from "./tokens.ts";

const EXPIRIES = [
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 6 * 3600 },
  { label: "24 hours", seconds: 24 * 3600 },
  { label: "3 days", seconds: 3 * 24 * 3600 },
  { label: "7 days", seconds: 7 * 24 * 3600 },
] as const;

const CUSTOM = "custom";

type Side = { token: string; custom: string; amount: string };

function TokenField(props: {
  id: string;
  side: Side;
  onChange: (side: Side) => void;
  error?: string;
}) {
  const { side } = props;
  return (
    <div className="token-field">
      <div className="pair">
        <select
          aria-label={`${props.id} token`}
          value={side.token}
          onChange={(e) => props.onChange({ ...side, token: e.target.value })}
        >
          {KNOWN_TOKENS.map((t) => (
            <option key={t.address} value={t.address}>
              {t.symbol}
            </option>
          ))}
          <option value={CUSTOM}>Another token…</option>
        </select>
        <input
          aria-label={`${props.id} amount`}
          className="mono"
          inputMode="decimal"
          placeholder="0.00"
          value={side.amount}
          onChange={(e) => props.onChange({ ...side, amount: e.target.value })}
        />
      </div>
      {side.token === CUSTOM && (
        <input
          aria-label={`${props.id} token address`}
          className="mono"
          placeholder="Token address 0x…"
          spellCheck={false}
          value={side.custom}
          onChange={(e) => props.onChange({ ...side, custom: e.target.value })}
        />
      )}
      {props.error && (
        <p className="error" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

export function NewTrade(props: { onOpen: (fragment: string) => void }) {
  const { chain, session } = useApp();
  const me = session?.snapshot.address as Address;
  const [iSell, setISell] = useState(true);
  const [give, setGive] = useState<Side>({
    token: KNOWN_TOKENS[0]?.address ?? CUSTOM,
    custom: "",
    amount: "",
  });
  const [get, setGet] = useState<Side>({
    token: KNOWN_TOKENS[1]?.address ?? CUSTOM,
    custom: "",
    amount: "",
  });
  const [other, setOther] = useState("");
  const [seconds, setSeconds] = useState<number>(EXPIRIES[2].seconds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ pkg: TradePackage; fragment: string }>();
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const resolve = async (side: Side): Promise<Token> => {
    if (side.token !== CUSTOM) {
      const known = KNOWN_TOKENS.find((t) => t.address === side.token);
      if (known) return known;
    }
    if (!isAddress(side.custom, { strict: false }))
      throw new TermsError("token", "Enter a token address.");
    const token = await readToken(chain.client, side.custom as Address);
    if (!token) throw new TermsError("token", "That address is not a token on Arc.");
    return token;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      let giveToken: Token;
      let getToken: Token;
      try {
        giveToken = await resolve(give);
      } catch (error) {
        throw Object.assign(error as Error, { field: "give" });
      }
      try {
        getToken = await resolve(get);
      } catch (error) {
        throw Object.assign(error as Error, { field: "get" });
      }
      const now = Math.floor(Date.now() / 1000);
      const sellerSide = iSell
        ? { token: giveToken, amount: give.amount }
        : { token: getToken, amount: get.amount };
      const buyerSide = iSell
        ? { token: getToken, amount: get.amount }
        : { token: giveToken, amount: give.amount };
      const terms = parseTerms(
        {
          seller: iSell ? me : other,
          buyer: iSell ? other : me,
          sellToken: sellerSide.token.address,
          sellAmount: sellerSide.amount,
          payToken: buyerSide.token.address,
          payAmount: buyerSide.amount,
          expiry: now + seconds,
        },
        [giveToken, getToken],
        now,
      );
      const pkg: TradePackage = { tradeId: newTradeId(), terms, salt: newSalt() };
      setCreated({ pkg, fragment: encodePackage(pkg) });
      setReveal(false);
    } catch (error) {
      const field = (error as { field?: string }).field ?? "form";
      const map: Record<string, string> = {
        buyer: "other",
        seller: "other",
        sellAmount: iSell ? "give" : "get",
        payAmount: iSell ? "get" : "give",
        sellToken: iSell ? "give" : "get",
        payToken: iSell ? "get" : "give",
      };
      setErrors({ [map[field] ?? field]: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const link = created ? `${window.location.origin}/#/trade/${created.fragment}` : "";

  if (created) {
    return (
      <section className="panel" aria-label="Your trade">
        <h2>Your trade is ready</h2>
        <p className="lede">
          Send the private link to the other party. It holds the terms and the salt that keeps them
          off the chain until settlement, so share it only with them.
        </p>
        {reveal ? (
          <input
            className="mono"
            readOnly
            value={link}
            aria-label="Private trade link"
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <button type="button" className="btn btn-outline" onClick={() => setReveal(true)}>
            Show the private link
          </button>
        )}
        <div className="actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
          >
            {copied ? "Copied" : "Copy the link"}
          </button>
          <button type="button" className="btn" onClick={() => props.onOpen(created.fragment)}>
            Open the room
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="panel" onSubmit={(e) => void submit(e)}>
      <h2>New trade</h2>
      <fieldset className="role">
        <legend>You are</legend>
        <label>
          <input type="radio" name="role" checked={iSell} onChange={() => setISell(true)} /> the
          seller
        </label>
        <label>
          <input type="radio" name="role" checked={!iSell} onChange={() => setISell(false)} /> the
          buyer
        </label>
      </fieldset>
      <p className="label">You send</p>
      <TokenField id="send" side={give} onChange={setGive} error={errors.give} />
      <p className="label">You receive</p>
      <TokenField id="receive" side={get} onChange={setGet} error={errors.get} />
      <label htmlFor="other">Counterparty address</label>
      <input
        id="other"
        className="mono"
        placeholder="0x…"
        spellCheck={false}
        value={other}
        onChange={(e) => setOther(e.target.value)}
      />
      {errors.other && (
        <p className="error" role="alert">
          {errors.other}
        </p>
      )}
      <label htmlFor="expiry">Valid for</label>
      <select id="expiry" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
        {EXPIRIES.map((e) => (
          <option key={e.seconds} value={e.seconds}>
            {e.label}
          </option>
        ))}
      </select>
      {errors.expiry && (
        <p className="error" role="alert">
          {errors.expiry}
        </p>
      )}
      {errors.form && (
        <p className="error" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Checking…" : "Create the trade"}
      </button>
    </form>
  );
}

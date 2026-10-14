import { type FormEvent, useState } from "react";
import { NewTrade } from "../trade/NewTrade.tsx";

const FRAGMENT = /([A-Za-z0-9_-]{40,})\/?$/;

export function Trades() {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string>();

  const open = (fragment: string) => {
    window.location.hash = `#/trade/${fragment}`;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const match = link.trim().match(FRAGMENT);
    if (!match?.[1]) return setError("Paste the whole private link you were sent.");
    setError(undefined);
    open(match[1]);
  };

  return (
    <section className="page" aria-labelledby="trades-title">
      <h1 id="trades-title">Trades</h1>
      <div className="stack">
        <form className="panel" onSubmit={submit}>
          <h2>Open a trade</h2>
          <label htmlFor="link">Private link from the other party</label>
          <input
            id="link"
            className="mono"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-outline" disabled={link.trim() === ""}>
            Open the trade
          </button>
        </form>
        <NewTrade onOpen={open} />
      </div>
    </section>
  );
}

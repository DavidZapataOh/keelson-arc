import { useState } from "react";
import type { Wallet } from "../wallet/types.ts";

export function Connect(props: {
  wallets: Wallet[];
  error: string | undefined;
  onConnect: (wallet: Wallet) => void;
  onReadOnly: (address: string) => void;
}) {
  const [address, setAddress] = useState("");
  return (
    <section className="panel" aria-labelledby="connect-title">
      <h1 id="connect-title">Connect a wallet</h1>
      <p className="lede">
        Keelson settles a trade between two verified parties on Arc. Connect the wallet that holds
        the trade, or open a trade read-only to review and export its transactions.
      </p>

      {props.wallets.length > 0 ? (
        <ul className="wallets">
          {props.wallets.map((wallet) => (
            <li key={wallet.info.uuid}>
              <button type="button" className="row" onClick={() => props.onConnect(wallet)}>
                <img src={wallet.info.icon} alt="" width="28" height="28" />
                <span>{wallet.info.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="note">
          No browser wallet was found. Install one, or use read-only mode below.
        </p>
      )}

      <form
        className="readonly"
        onSubmit={(event) => {
          event.preventDefault();
          props.onReadOnly(address.trim());
        }}
      >
        <label htmlFor="readonly-address">Read-only address</label>
        <div className="field">
          <input
            id="readonly-address"
            className="mono"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="btn">
            Open read-only
          </button>
        </div>
        <p className="hint">
          For custody teams: review a trade and export each transaction without connecting a wallet.
        </p>
      </form>

      {props.error && (
        <p className="error" role="alert">
          {props.error}
        </p>
      )}
    </section>
  );
}

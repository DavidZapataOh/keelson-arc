import { useEffect, useRef, useState } from "react";
import type { Network } from "../chain.ts";
import type { Session } from "../wallet/session.ts";

export const ROUTES = [
  { id: "trades", label: "Trades" },
  { id: "credential", label: "Credential" },
  { id: "lists", label: "Lists" },
] as const;

export type RouteId = (typeof ROUTES)[number]["id"];

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function TopBar(props: {
  route: RouteId;
  session: Session | undefined;
  faucetUrl?: string | undefined;
  networks: Network[];
  current: Network;
  onSelectNetwork: (id: Network["id"]) => void;
  onDisconnect: () => void;
}) {
  return (
    <header className="topbar">
      <a className="brand" href="#/trades" aria-label="Keelson">
        <img src="/keelson.svg" alt="" height="28" />
      </a>
      <nav aria-label="Primary">
        {ROUTES.map(({ id, label }) => (
          <a key={id} href={`#/${id}`} aria-current={props.route === id ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <div className="topbar-end">
        {props.faucetUrl && (
          <a
            className="faucet mono"
            href={props.faucetUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get test funds
          </a>
        )}
        <NetworkControl
          networks={props.networks}
          current={props.current}
          onSelect={props.onSelectNetwork}
        />
        {props.session && <WalletMenu session={props.session} onDisconnect={props.onDisconnect} />}
      </div>
    </header>
  );
}

function NetworkControl(props: {
  networks: Network[];
  current: Network;
  onSelect: (id: Network["id"]) => void;
}) {
  if (props.networks.length < 2) return <span className="badge mono">{props.current.label}</span>;
  return (
    <select
      className="badge mono network"
      aria-label="Network"
      value={props.current.id}
      onChange={(event) => props.onSelect(event.target.value as Network["id"])}
    >
      {props.networks.map((network) => (
        <option key={network.id} value={network.id} disabled={!network.available}>
          {network.available ? network.label : `${network.label} (not deployed yet)`}
        </option>
      ))}
    </select>
  );
}

function WalletMenu(props: { session: Session; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { address } = props.session.snapshot;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="wallet" ref={root}>
      <button
        type="button"
        className="pill mono"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {short(address)}
        <svg
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="m2 4 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="menu">
          <p className="menu-meta mono">
            {props.session.kind === "readonly" ? "Read-only" : props.session.name}
          </p>
          <button type="button" onClick={copy}>
            {copied ? "Copied" : "Copy address"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              props.onDisconnect();
            }}
          >
            {props.session.kind === "readonly" ? "Leave read-only" : "Disconnect"}
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import type { DeploymentFile } from "../deployment/schema.ts";
import type { Call } from "../export/transaction.ts";
import {
  describeCall,
  download,
  exportTransaction,
  knownContracts,
  tokenContract,
  transactionJson,
} from "../export/transaction.ts";
import type { Token } from "../trade/terms.ts";

const show = (value: unknown): string =>
  typeof value === "bigint"
    ? value.toString()
    : typeof value === "object" && value !== null
      ? JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))
      : String(value);

/** One transaction as a custody team needs it: what to allowlist, the exact fields, and a file. */
export function ExportPanel(props: {
  call: Call;
  label: string;
  file: DeploymentFile;
  tokens: (Token & { verified: boolean })[];
  stale: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const contracts = [
    ...knownContracts(props.file),
    ...props.tokens.map((t) => tokenContract(t.symbol, t.address)),
  ];
  let described: ReturnType<typeof describeCall> | undefined;
  try {
    described = describeCall(props.call, { contracts });
  } catch {
    described = undefined;
  }
  const tx = exportTransaction(props.call);
  const json = transactionJson(tx);
  const name = described ? `${described.contract}.${described.function}` : "transaction";

  return (
    <section className="export" aria-label={`Export: ${props.label}`}>
      <header>
        <h3>{props.label}</h3>
        <button type="button" className="link-button" onClick={props.onClose}>
          Close
        </button>
      </header>
      {props.stale && (
        <p className="banner warn" role="status">
          The trade moved since this was prepared. Review it before signing.
        </p>
      )}
      <dl className="export-fields mono">
        <div>
          <dt>Allowlist</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>Chain id</dt>
          <dd>{tx.chainId}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{tx.to}</dd>
        </div>
        {described?.args.map((arg, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: arguments have no identity beyond their position
          <div key={i}>
            <dt>Argument {i + 1}</dt>
            <dd>{show(arg)}</dd>
          </div>
        ))}
        <div>
          <dt>Max fee per gas</dt>
          <dd>{tx.maxFeePerGas.toString()}</dd>
        </div>
      </dl>
      <div className="actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            void navigator.clipboard.writeText(json).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? "Copied" : "Copy as JSON"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => download(`keelson-${name.toLowerCase().replace(".", "-")}.json`, json)}
        >
          Download the file
        </button>
      </div>
    </section>
  );
}

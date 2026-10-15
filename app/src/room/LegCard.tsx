import { type ReactNode, useState } from "react";
import type { Role } from "../trade/state.ts";
import { STEP_LABELS, type Step } from "./steps.ts";

const SHORT = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function LegCard(props: {
  label: string;
  role: Role;
  address: string;
  you: boolean;
  steps: Step[];
  actionFor?: (step: Step) => ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(props.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <article className="leg" aria-label={`${props.label}, ${props.role}`}>
      <header>
        <p className="leg-name mono">
          <span className="leg-tag">{props.label}</span> {props.role.toUpperCase()}
          {props.you && <span className="you">YOU</span>}
        </p>
        <div className="leg-address">
          <button
            type="button"
            className="copy-address mono"
            onClick={() => void copy()}
            aria-label={`Copy the ${props.role} address`}
          >
            {copied ? "Copied" : SHORT(props.address)}
          </button>
          <div className="counterparty">
            <span className="label mono">Counterparty</span>
            <span className="bar" role="img" aria-label="The counterparty identity is private" />
          </div>
        </div>
      </header>
      <ol className="steps-list">
        {props.steps.map((step, i) => (
          <li key={step.id} data-status={step.status}>
            <span className={`step-mark ${step.status}`} aria-hidden="true" />
            <span className="step-index mono" aria-hidden="true">
              {i + 1}
            </span>
            <span className="step-name">{STEP_LABELS[step.id]}</span>
            <span className={`step-state ${step.status}`}>
              {step.status === "done" && "Done"}
              {step.status === "current" && "Your next step"}
              {step.status === "waiting" && "Waiting"}
              {step.status === "blocked" && (step.reason ?? "Blocked")}
            </span>
            {step.status === "current" && props.actionFor && (
              <div className="step-extra">{props.actionFor(step)}</div>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}

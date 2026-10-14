import type { DeploymentError } from "../deployment/schema.ts";

const REASONS: Record<DeploymentError["code"], string> = {
  unreachable: "The deployment could not be reached.",
  "invalid-file": "The deployment file is not valid.",
  "wrong-chain": "The deployment is not on Arc.",
  "no-code": "A contract is missing at a configured address.",
  "wrong-link": "The configured contracts do not point at each other.",
};

export function Loading() {
  return (
    <section className="panel" aria-live="polite">
      <p className="mono">Checking the deployment…</p>
    </section>
  );
}

export function DeploymentFailed(props: { error: DeploymentError | Error; onRetry: () => void }) {
  const code = "code" in props.error ? props.error.code : "unreachable";
  return (
    <section className="panel" role="alert">
      <h1>Keelson is not available</h1>
      <p className="lede">{REASONS[code]} Nothing can be sent until this is fixed.</p>
      <p className="note mono">{props.error.message}</p>
      <button type="button" className="btn" onClick={props.onRetry}>
        Try again
      </button>
    </section>
  );
}

export function WrongNetwork(props: { onSwitch: () => void }) {
  return (
    <section className="panel" role="alert" aria-labelledby="network-title">
      <h1 id="network-title">Switch to Arc</h1>
      <p className="lede">
        Your wallet is on another network. Keelson only works on Arc mainnet, and nothing is sent
        from the wrong network.
      </p>
      <button type="button" className="btn" onClick={props.onSwitch}>
        Switch to Arc
      </button>
    </section>
  );
}

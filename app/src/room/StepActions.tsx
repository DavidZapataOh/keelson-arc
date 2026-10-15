import type { StepId } from "./steps.ts";
import type { Controller, Prepared, Run } from "./useController.ts";

const percent = (loaded: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

function Progress({ run }: { run: Run }) {
  const progress = run.progress;
  if (!progress) return <p className="note mono">{run.message}</p>;
  if (progress.phase === "download") {
    const value = percent(progress.loaded, progress.total);
    return (
      <div className="progress" role="status">
        <p className="note mono">Downloading the circuit… {value}%</p>
        <progress max={100} value={value} aria-label="Circuit download" />
      </div>
    );
  }
  if (progress.phase === "verify")
    return (
      <p className="note mono" role="status">
        Checking the circuit files…
      </p>
    );
  return (
    <p className="note mono" role="status">
      Proving in your browser…
    </p>
  );
}

type Props = {
  step: StepId;
  controller: Controller;
  readOnly: boolean;
  amountLabel: string;
  hasCredential: boolean;
  onExport: (prepared: Prepared) => void;
};

/** The control of the connected party's current step. Each step can be sent from the wallet or exported. */
export function StepActions({
  step,
  controller,
  readOnly,
  amountLabel,
  hasCredential,
  onExport,
}: Props) {
  const run = controller.runs[step === "credential" ? "proof" : step] ?? { phase: "idle" as const };
  const working = run.phase === "working";

  if (step === "credential") {
    return (
      <div className="step-actions">
        <a className="btn btn-outline" href="#/credential">
          {hasCredential ? "Review your credential" : "Unlock your credential"}
        </a>
      </div>
    );
  }

  const exportable = (which: "proof" | "approve" | "commit") => {
    const prepared = controller.prepare(which);
    if (!prepared) return null;
    return (
      <button type="button" className="link-button" onClick={() => onExport(prepared)}>
        Export transaction
      </button>
    );
  };

  if (step === "proof") {
    const proved = controller.proof !== undefined;
    return (
      <div className="step-actions">
        {working ? (
          <Progress run={run} />
        ) : (
          <div className="actions">
            {!proved && (
              <button type="button" className="btn" onClick={() => void controller.prove()}>
                {readOnly ? "Generate the proof" : "Prove and attest"}
              </button>
            )}
            {proved && !readOnly && (
              <button type="button" className="btn" onClick={() => void controller.send("proof")}>
                Send the proof
              </button>
            )}
            {proved && exportable("proof")}
          </div>
        )}
        {run.message && !working && (
          <p
            className={run.phase === "failed" ? "error" : "note"}
            role={run.phase === "failed" ? "alert" : "status"}
          >
            {run.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="step-actions">
      <div className="actions">
        {!readOnly && (
          <button
            type="button"
            className="btn"
            disabled={working}
            onClick={() => void controller.send(step)}
          >
            {step === "approve" ? `Approve ${amountLabel}` : "Commit to the terms"}
          </button>
        )}
        {exportable(step)}
      </div>
      {run.message && (
        <p
          className={run.phase === "failed" ? "error" : "note"}
          role={run.phase === "failed" ? "alert" : "status"}
        >
          {run.message}
        </p>
      )}
    </div>
  );
}

import type { Readiness } from "./steps.ts";
import type { Run } from "./useController.ts";

export function SettleBar(props: {
  ready: Readiness;
  run: Run | undefined;
  readOnly: boolean;
  onSettle: () => void;
  onExport: () => void;
}) {
  const { ready, run } = props;
  const working = run?.phase === "working";
  return (
    <div className="settle">
      {ready.ready ? (
        <div className="settle-ready">
          <p role="status">Both legs are ready to settle.</p>
          <div className="actions">
            {!props.readOnly && (
              <button type="button" className="btn" disabled={working} onClick={props.onSettle}>
                {working ? "Settling…" : "Settle both legs"}
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={props.onExport}>
              Export transaction
            </button>
          </div>
        </div>
      ) : (
        <p className="settle-status" role="status">
          {ready.reason}
        </p>
      )}
      {run?.message && (
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

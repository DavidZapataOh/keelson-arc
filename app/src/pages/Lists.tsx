import { useListsContext } from "../lists/context.tsx";
import type { ListStatus } from "../lists/status.ts";

const short = (value: bigint) => {
  const hex = `0x${value.toString(16).padStart(64, "0")}`;
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
};

const STATE_TEXT = {
  accepted: "Accepted by the contract",
  stale: "Not accepted: proofs against this list would be rejected",
  unknown: "Could not check the contract",
} as const;

function source(
  name: ListStatus["name"],
  issued: string | undefined,
  updatedAt: number | undefined,
) {
  if (name === "Sanctions" && issued) return `Issued ${issued}`;
  if (name === "Revocations" && updatedAt) {
    return `Updated ${new Date(updatedAt * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
  return "Issuer public key";
}

export function Lists() {
  const { state, refresh } = useListsContext();
  return (
    <section className="page" aria-labelledby="lists-title">
      <h1 id="lists-title">Lists</h1>
      <p className="lede">
        Every proof is made against these three lists, downloaded whole to this browser. A list is
        usable only while the contracts accept its root.
      </p>

      {state.phase === "loading" && (
        <p className="mono" role="status">
          Opening the lists…
        </p>
      )}

      {state.phase === "failed" && (
        <div className="alert" role="alert">
          <p>{state.message}</p>
          <button type="button" className="btn" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}

      {state.phase === "ready" && (
        <>
          <ul className="lists">
            {state.status.map((item) => (
              <li key={item.name} data-state={item.state}>
                <span className={`mark ${item.state}`} aria-hidden="true" />
                <div className="list-main">
                  <h2>{item.name}</h2>
                  <p className="note">
                    {source(
                      item.name,
                      state.summary.sanctionsIssued,
                      state.summary.revocationsUpdatedAt,
                    )}
                  </p>
                </div>
                <dl className="list-facts mono">
                  <div>
                    <dt>Root</dt>
                    <dd>{short(item.root)}</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{item.state === "accepted" ? item.version.toString() : "—"}</dd>
                  </div>
                </dl>
                <p className={`state ${item.state}`}>{STATE_TEXT[item.state]}</p>
              </li>
            ))}
          </ul>
          <div>
            <button type="button" className="btn btn-outline" onClick={() => void refresh()}>
              Download the lists again
            </button>
          </div>
        </>
      )}
    </section>
  );
}

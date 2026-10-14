import { useMemo } from "react";
import { Room } from "../room/Room.tsx";
import { decodePackage, PackageError } from "../trade/package.ts";

export function Trade({ fragment }: { fragment: string }) {
  const parsed = useMemo(() => {
    try {
      return { pkg: decodePackage(fragment) };
    } catch (error) {
      return {
        error: error instanceof PackageError ? error.message : "This is not a valid trade link.",
      };
    }
  }, [fragment]);

  if (parsed.error) {
    return (
      <section className="panel" role="alert">
        <h1>This link does not open</h1>
        <p className="lede">{parsed.error} Ask the other party to send it again, whole.</p>
        <a className="btn btn-outline" href="#/trades">
          Back to trades
        </a>
      </section>
    );
  }
  return parsed.pkg ? <Room pkg={parsed.pkg} /> : null;
}

import { useCallback, useEffect, useState } from "react";
import { readOnly } from "../wallet/readonly.ts";
import { connect, type Session, type Snapshot } from "../wallet/session.ts";
import type { Wallet } from "../wallet/types.ts";

export function useSession() {
  const [session, setSession] = useState<Session>();
  const [, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!session) return;
    const stop = session.onChange(setSnapshot);
    return () => {
      stop();
      session.close();
    };
  }, [session]);

  const connectWallet = useCallback(async (wallet: Wallet) => {
    setError(undefined);
    try {
      setSession(await connect(wallet));
    } catch (cause) {
      const rejected = (cause as { code?: number }).code === 4001;
      setError(rejected ? "The wallet request was dismissed." : "The wallet could not connect.");
    }
  }, []);

  const openReadOnly = useCallback((address: string) => {
    setError(undefined);
    try {
      setSession(readOnly(address));
    } catch {
      setError("That is not a valid address.");
    }
  }, []);

  const disconnect = useCallback(() => setSession(undefined), []);

  return { session, error, connectWallet, openReadOnly, disconnect };
}

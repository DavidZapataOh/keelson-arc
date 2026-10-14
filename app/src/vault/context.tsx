import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Vault } from "./vault.ts";

type Value = { vault: Vault | undefined; open: (vault: Vault) => void; lock: () => void };

const Context = createContext<Value | undefined>(undefined);

/** The unlocked vault lives for the session, so moving between pages never asks for the passphrase again. */
export function VaultProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<Vault>();
  const lock = useCallback(() => {
    setVault((current) => {
      current?.lock();
      return undefined;
    });
  }, []);
  useEffect(() => lock, [lock]);
  const value = useMemo(() => ({ vault, open: setVault, lock }), [vault, lock]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVault(): Value {
  const value = useContext(Context);
  if (!value) throw new Error("useVault outside of VaultProvider");
  return value;
}

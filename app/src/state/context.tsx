import { createContext, useContext } from "react";
import type { PublicClient } from "viem";
import type { DeploymentFile } from "../deployment/schema.ts";
import type { Session } from "../wallet/session.ts";

export type Chain = { file: DeploymentFile; client: PublicClient };

export type AppContext = {
  chain: Chain;
  session: Session | undefined;
};

const Context = createContext<AppContext | undefined>(undefined);

export const AppProvider = Context.Provider;

export function useApp(): AppContext {
  const value = useContext(Context);
  if (!value) throw new Error("useApp outside of AppProvider");
  return value;
}

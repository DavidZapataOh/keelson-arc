import { createContext, type ReactNode, useContext, useState } from "react";
import type { Chain } from "../state/context.tsx";
import { type ListsEngine, workerEngine } from "./engine.ts";
import { type ListsState, useLists } from "./useLists.ts";

type Value = { state: ListsState; refresh: () => Promise<void>; engine: ListsEngine };

const Context = createContext<Value | undefined>(undefined);

export function ListsProvider(props: {
  chain: Chain;
  makeEngine?: () => ListsEngine;
  children: ReactNode;
}) {
  const [engine] = useState(props.makeEngine ?? workerEngine);
  const { file, client } = props.chain;
  const [urls] = useState({ listsUrl: file.listsUrl, issuerUrl: file.issuerUrl });
  const [registries] = useState({
    issuers: file.issuers,
    sanctions: file.sanctions,
    revocations: file.revocations,
  });
  const { state, refresh } = useLists({ engine, client, urls, registries });
  return <Context.Provider value={{ state, refresh, engine }}>{props.children}</Context.Provider>;
}

export function useListsContext(): Value {
  const value = useContext(Context);
  if (!value) throw new Error("useListsContext outside of ListsProvider");
  return value;
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, PublicClient } from "viem";
import type { ListsEngine, ListsSummary, Urls } from "./engine.ts";
import { type ListStatus, listStatus } from "./status.ts";

export type ListsState =
  | { phase: "loading" }
  | { phase: "failed"; message: string }
  | { phase: "ready"; summary: ListsSummary; status: ListStatus[] };

const STATUS_EVERY_MS = 15_000;

type Registries = { issuers: Address; sanctions: Address; revocations: Address };

export function useLists(args: {
  engine: ListsEngine;
  client: PublicClient;
  urls: Urls;
  registries: Registries;
}) {
  const { engine, client, urls, registries } = args;
  const [state, setState] = useState<ListsState>({ phase: "loading" });
  const summary = useRef<ListsSummary | undefined>(undefined);

  const checkStatus = useCallback(async () => {
    const current = summary.current;
    if (!current) return;
    const status = await listStatus(client, registries, current.roots);
    setState({ phase: "ready", summary: current, status });
  }, [client, registries]);

  const refresh = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      summary.current = await engine.load(urls);
      await checkStatus();
    } catch (error) {
      summary.current = undefined;
      setState({ phase: "failed", message: (error as Error).message });
    }
  }, [engine, urls, checkStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const tick = () => void checkStatus();
    const timer = setInterval(tick, STATUS_EVERY_MS);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [checkStatus]);

  return { state, refresh };
}

import type { Lists } from "./fetch.ts";
import type { Roots } from "./status.ts";

export type ListsSummary = {
  roots: Roots;
  sanctionsIssued: string | undefined;
  revocationsUpdatedAt: number | undefined;
  fetchedAt: number;
};

export type Urls = { listsUrl: string; issuerUrl: string };

/** Where the lists are opened and kept: a worker in the browser, so hashing never blocks the page. */
export type ListsEngine = {
  load(urls: Urls): Promise<ListsSummary>;
  revoked(credentialIds: bigint[]): Promise<boolean[]>;
};

export const summarize = (lists: Lists): ListsSummary => ({
  roots: {
    issuers: lists.issuers.root,
    sanctions: lists.sanctions.root,
    revocations: lists.revocations.root,
  },
  sanctionsIssued: lists.sanctionsIssued,
  revocationsUpdatedAt: lists.revocationsUpdatedAt,
  fetchedAt: lists.fetchedAt,
});

type Reply = { id?: number; ready?: true; result?: unknown; error?: { message: string } };

export function workerEngine(): ListsEngine {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  let next = 0;
  const pending = new Map<
    number,
    { resolve: (value: never) => void; reject: (error: Error) => void }
  >();

  let started: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });

  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    if (data.ready) return started();
    const entry = data.id === undefined ? undefined : pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id as number);
    if (data.error) entry.reject(new Error(data.error.message));
    else entry.resolve(data.result as never);
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || "the lists could not be opened in this browser");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  const call = <T>(type: string, payload: unknown) =>
    new Promise<T>((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve: resolve as (value: never) => void, reject });
      void ready.then(() => worker.postMessage({ id, type, payload }));
    });

  return {
    load: (urls) => call<ListsSummary>("load", urls),
    revoked: (ids) => call<boolean[]>("revoked", ids),
  };
}

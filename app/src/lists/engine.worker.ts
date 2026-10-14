import "../polyfills.ts";
import { summarize, type Urls } from "./engine.ts";
import { type Lists, loadLists } from "./fetch.ts";

let lists: Lists | undefined;

type Request = { id: number; type: "load" | "revoked"; payload: unknown };

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === "load") {
      lists = await loadLists(data.payload as Urls);
      self.postMessage({ id: data.id, result: summarize(lists) });
    } else if (data.type === "revoked") {
      const current = lists;
      if (!current) throw new Error("the lists are not loaded");
      const ids = data.payload as bigint[];
      self.postMessage({ id: data.id, result: ids.map((id) => current.revocations.contains(id)) });
    }
  } catch (error) {
    self.postMessage({ id: data.id, error: { message: (error as Error).message } });
  }
};

self.postMessage({ ready: true });

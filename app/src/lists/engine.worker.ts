import "../polyfills.ts";
import { proveCompliance } from "@keelson/sdk/prover";
import { fetchArtifact } from "../prove/artifacts.ts";
import type { ProveRequest } from "../prove/types.ts";
import { summarize, type Urls } from "./engine.ts";
import { type Lists, loadLists } from "./fetch.ts";

let lists: Lists | undefined;

type Request = { id: number; type: "load" | "revoked" | "prove"; payload: unknown };

const need = (): Lists => {
  if (!lists) throw new Error("the lists are not loaded");
  return lists;
};

async function prove(id: number, request: ProveRequest) {
  const current = need();
  const { artifacts } = request;
  const parts = { wasm: { loaded: 0, total: 0 }, zkey: { loaded: 0, total: 0 } };
  const report = (kind: "wasm" | "zkey") => (progress: { loaded: number; total: number }) => {
    parts[kind] = progress;
    self.postMessage({
      id,
      progress: {
        phase: "download",
        loaded: parts.wasm.loaded + parts.zkey.loaded,
        total: parts.wasm.total + parts.zkey.total,
      },
    });
  };
  const [wasm, zkey] = await Promise.all([
    fetchArtifact(artifacts.wasmUrl, artifacts.wasmSha256, report("wasm")),
    fetchArtifact(artifacts.zkeyUrl, artifacts.zkeySha256, report("zkey")),
  ]);
  self.postMessage({ id, progress: { phase: "prove" } });
  return proveCompliance({
    held: request.held,
    tradeId: request.tradeId,
    tradingAddress: request.tradingAddress,
    context: {
      issuers: current.issuers,
      issuerIndex: request.issuerIndex,
      sanctions: current.sanctions,
      revocations: current.revocations,
      regulatorKey: request.regulatorKey,
      minTier: request.minTier,
      validAt: request.validAt,
    },
    keys: { wasm, zkey },
  });
}

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === "load") {
      lists = await loadLists(data.payload as Urls);
      self.postMessage({ id: data.id, result: summarize(lists) });
    } else if (data.type === "revoked") {
      const current = need();
      const ids = data.payload as bigint[];
      self.postMessage({ id: data.id, result: ids.map((id) => current.revocations.contains(id)) });
    } else if (data.type === "prove") {
      const result = await prove(data.id, data.payload as ProveRequest);
      self.postMessage({ id: data.id, result });
    }
  } catch (error) {
    const failure = error as Error & { code?: string };
    self.postMessage({ id: data.id, error: { message: failure.message, code: failure.code } });
  }
};

self.postMessage({ ready: true });

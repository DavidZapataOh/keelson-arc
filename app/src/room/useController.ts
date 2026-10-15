import { hashTerms } from "@keelson/sdk/trade";
import { useCallback, useRef, useState } from "react";
import { approveCall, attestCall, commitCall, settleCall } from "../actions/calls.ts";
import { ProofContextError, readProofContext } from "../actions/context.ts";
import { sendCall } from "../actions/send.ts";
import type { Call } from "../export/transaction.ts";
import type { ListsEngine } from "../lists/engine.ts";
import type { ListStatus } from "../lists/status.ts";
import { ArtifactError, artifactSpec } from "../prove/artifacts.ts";
import type { ProveProgress, ProveResult } from "../prove/types.ts";
import type { Chain } from "../state/context.tsx";
import type { TradePackage } from "../trade/package.ts";
import { type Role, readTrade, type TradeState } from "../trade/state.ts";
import type { Vault } from "../vault/vault.ts";
import type { Session } from "../wallet/session.ts";
import { readiness, type StepId } from "./steps.ts";

export type Phase = "idle" | "working" | "done" | "failed";

export type Run = {
  phase: Phase;
  message?: string;
  progress?: ProveProgress;
};

export type Prepared = { call: Call; label: string };

const circuitHashes = () => ({
  wasm: import.meta.env.VITE_CIRCUIT_WASM_SHA256,
  zkey: import.meta.env.VITE_CIRCUIT_ZKEY_SHA256,
});

type Inputs = {
  chain: Chain;
  session: Session;
  vault: Vault | undefined;
  engine: ListsEngine;
  status: ListStatus[];
  pkg: TradePackage;
  mine: Role | undefined;
  refresh: () => Promise<void>;
  hashes?: { wasm?: string; zkey?: string };
};

export type Controller = {
  runs: Partial<Record<StepId | "settle", Run>>;
  proof: ProveResult | undefined;
  prove(): Promise<void>;
  send(step: "proof" | "approve" | "commit"): Promise<void>;
  settle(): Promise<void>;
  prepare(step: "proof" | "approve" | "commit" | "settle"): Prepared | undefined;
};

/** Runs the steps of the connected leg. Every step builds one call, which can be sent from the wallet or exported. */
export function useController(inputs: Inputs): Controller {
  const [runs, setRuns] = useState<Controller["runs"]>({});
  const [proof, setProof] = useState<ProveResult>();
  const latest = useRef(inputs);
  latest.current = inputs;

  const set = useCallback(
    (id: StepId | "settle", run: Run) => setRuns((r) => ({ ...r, [id]: run })),
    [],
  );

  const prepare = useCallback(
    (step: "proof" | "approve" | "commit" | "settle"): Prepared | undefined => {
      const { chain, pkg, mine } = latest.current;
      const { file } = chain;
      const { terms } = pkg;
      if (step === "proof") {
        return proof
          ? { call: attestCall(file.compliance, proof), label: "Attest the proof" }
          : undefined;
      }
      if (step === "settle") {
        return {
          call: settleCall(file.settlement, pkg.tradeId, terms, pkg.salt),
          label: "Settle both legs",
        };
      }
      if (!mine) return undefined;
      if (step === "approve") {
        const token = mine === "seller" ? terms.sellToken : terms.payToken;
        const amount = mine === "seller" ? terms.sellAmount : terms.payAmount;
        return { call: approveCall(token, file.settlement, amount), label: "Approve the token" };
      }
      const termsHash = hashTerms({
        settlement: file.settlement,
        chainId: file.chainId,
        tradeId: pkg.tradeId,
        terms,
        salt: pkg.salt,
      });
      return {
        call: commitCall(file.settlement, pkg.tradeId, termsHash),
        label: "Commit to the terms",
      };
    },
    [proof],
  );

  const deliver = useCallback(
    async (id: StepId | "settle", call: Call) => {
      const { chain, session, refresh } = latest.current;
      set(id, { phase: "working", message: "Confirm in your wallet…" });
      const result = await sendCall(chain, session, call);
      if (result.status === "sent") {
        await refresh();
        set(id, { phase: "done" });
      } else if (result.status === "rejected") {
        set(id, { phase: "idle", message: "You dismissed the request. Nothing was sent." });
      } else {
        set(id, { phase: "failed", message: result.message });
      }
    },
    [set],
  );

  const prove = useCallback(async () => {
    const { chain, session, vault, engine, status, pkg } = latest.current;
    const fail = (message: string) => set("proof", { phase: "failed", message });
    if (!vault) return fail("Unlock your credential first.");
    const now = BigInt(Math.floor(Date.now() / 1000));
    const held = vault.credentials().find((item) => item.credential.expiry > now);
    if (!held) return fail("You have no credential that is still valid.");
    set("proof", { phase: "working", message: "Preparing…" });
    try {
      const artifacts = artifactSpec(
        chain.file.assetsUrl,
        latest.current.hashes ?? circuitHashes(),
      );
      const context = await readProofContext(chain, status);
      const result = await engine.prove(
        {
          held,
          tradeId: pkg.tradeId,
          tradingAddress: BigInt(session.snapshot.address),
          minTier: context.minTier,
          validAt: context.validAt,
          regulatorKey: context.regulatorKey,
          issuerIndex: 0,
          artifacts,
        },
        (progress) => set("proof", { phase: "working", progress }),
      );
      setProof(result);
      set("proof", { phase: "idle", message: "Proof ready." });
      if (session.kind === "wallet") {
        await deliver("proof", attestCall(chain.file.compliance, result));
      }
    } catch (error) {
      if (error instanceof ProofContextError || error instanceof ArtifactError) {
        return fail(error.message);
      }
      const text = (error as Error).message ?? "";
      fail(
        /revoked|sanction|listed/i.test(text)
          ? "This credential cannot be proven for: it is revoked or on a sanctions list."
          : "The proof could not be generated. Download the lists again and retry.",
      );
    }
  }, [deliver, set]);

  const send = useCallback(
    async (step: "proof" | "approve" | "commit") => {
      const prepared = prepare(step);
      if (!prepared) return;
      await deliver(step, prepared.call);
    },
    [deliver, prepare],
  );

  const settle = useCallback(async () => {
    const { chain, pkg } = latest.current;
    set("settle", { phase: "working", message: "Checking the trade…" });
    const fresh: TradeState = await readTrade(chain, pkg);
    const ready = readiness(pkg.terms, fresh);
    if (!ready.ready) {
      set("settle", {
        phase: "failed",
        message: `Not ready to settle: ${ready.reason ?? "the trade changed"}.`,
      });
      return;
    }
    const prepared = prepare("settle");
    if (prepared) await deliver("settle", prepared.call);
  }, [deliver, prepare, set]);

  return { runs, proof, prove, send, settle, prepare };
}

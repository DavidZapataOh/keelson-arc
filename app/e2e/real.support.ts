import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { cors } from "./support.ts";

const circuit = new URL("../../circuits/build/compliance/", import.meta.url).pathname;

export const circuitFiles = {
  wasm: `${circuit}compliance_js/compliance.wasm`,
  zkey: `${circuit}compliance.zkey`,
};

export type Wiring = {
  rpcUrl: string;
  chainId: number;
  deployment: Record<string, unknown>;
  sanctionsJson: string;
  revocationsJson: () => string;
  issuerKey: { Ax: string; Ay: string };
};

/** Routes the page's HTTPS endpoints to the real local node, the real lists and the real circuit files. */
export async function wire(page: Page, wiring: Wiring, account: string) {
  const host = "https://rpc.local.test/";
  await page.route("**/deployment.json", (route) => route.fulfill({ json: wiring.deployment }));
  await page.route(`${host}**`, async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    const response = await fetch(wiring.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: route.request().postData() ?? "",
    });
    return route.fulfill({
      headers: cors,
      body: await response.text(),
      contentType: "application/json",
    });
  });
  const json = (body: string) => ({ headers: cors, body, contentType: "application/json" });
  await page.route("https://lists.local.test/sanctions-latest.json", (r) =>
    r.fulfill(json(wiring.sanctionsJson)),
  );
  await page.route("https://lists.local.test/revocations-latest.json", (r) =>
    r.fulfill(json(wiring.revocationsJson())),
  );
  await page.route("https://issuer.local.test/issuer", (r) =>
    r.fulfill(json(JSON.stringify(wiring.issuerKey))),
  );
  for (const [name, path] of [
    ["compliance.wasm", circuitFiles.wasm],
    ["compliance.zkey", circuitFiles.zkey],
  ] as const) {
    const body = readFileSync(path);
    await page.route(`https://assets.local.test/circuit/${name}`, (route) =>
      route.fulfill({
        headers: { ...cors, "content-length": String(body.length) },
        body,
        contentType: "application/octet-stream",
      }),
    );
  }
  await page.addInitScript(
    ({ account: from, chainId, rpc }) => {
      const provider = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [from];
          if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
          const response = await fetch(rpc, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
          });
          const body = (await response.json()) as {
            result?: unknown;
            error?: { message: string; code: number; data?: unknown };
          };
          if (body.error) throw Object.assign(new Error(body.error.message), body.error);
          return body.result;
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
      window.addEventListener("eip6963:requestProvider", () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: { uuid: "local", name: "Local wallet", icon: "data:,", rdns: "local" },
              provider,
            },
          }),
        ),
      );
    },
    { account, chainId: wiring.chainId, rpc: `${host}` },
  );
}

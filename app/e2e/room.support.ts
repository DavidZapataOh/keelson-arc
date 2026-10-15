import type { Page } from "@playwright/test";
import { answer, FILE } from "../test/support/fakeChain.ts";
import { answerBatched } from "../test/support/multicall.ts";
import { answerWorld, type World } from "../test/support/world.ts";
import { cors } from "./support.ts";

/** Deployment checks answer like a deployed system; everything else comes from the mutable world. */
function respond(world: World, method: string, params: unknown[]) {
  if (method === "eth_getCode" || method === "eth_call") {
    try {
      return answer(method, params);
    } catch {
      // not a deployment read: the world answers
    }
  }
  return answerWorld(world, method, params);
}

export async function serveChain(page: Page, world: World) {
  await page.route("**/deployment.json", (route) => route.fulfill({ json: FILE }));
  await page.route(`${FILE.rpcUrl}/**`, async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    const body = route.request().postDataJSON() as {
      id: number;
      method: string;
      params: unknown[];
    };
    return route.fulfill({
      headers: cors,
      json: {
        jsonrpc: "2.0",
        id: body.id,
        result: answerBatched(body.method, body.params ?? [], (m, p) => respond(world, m, p)),
      },
    });
  });
  for (const list of ["sanctions-latest.json", "revocations-latest.json"]) {
    await page.route(`${FILE.listsUrl}/${list}`, (route) =>
      route.fulfill({ status: 404, headers: cors }),
    );
  }
  await page.route(`${FILE.issuerUrl}/issuer`, (route) =>
    route.fulfill({ status: 404, headers: cors }),
  );
}

export async function installWallet(page: Page, address: string) {
  await page.addInitScript((account) => {
    const provider = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
        if (method === "eth_chainId") return "0x13b2";
        throw new Error(`unsupported ${method}`);
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
    window.addEventListener("eip6963:requestProvider", () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: { uuid: "e2e", name: "Test wallet", icon: "data:,", rdns: "e2e" },
            provider,
          },
        }),
      ),
    );
  }, address);
}

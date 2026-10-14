import { resolve } from "node:path";
import { IssuerService, Store } from "@keelson/issuer";
import { buildFromSource, openSnapshot, serializeSnapshot } from "@keelson/lists";
import { issuerFromKey, serializeSetSnapshot } from "@keelson/sdk";
import type { Page } from "@playwright/test";
import { answer, FILE } from "../test/support/fakeChain.ts";

const SAMPLE = resolve(
  new URL("../../lists/test/fixtures/sdn_advanced_sample.xml", import.meta.url).pathname,
);

export const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

/** A real issuer service and a real sanctions list, served to the page at the configured URLs. */
export async function serveLists(page: Page) {
  const { snapshot } = await buildFromSource(SAMPLE, 18);
  const key = issuerFromKey(new Uint8Array(32).fill(7));
  const issuer = new IssuerService(key, new Store(":memory:"), openSnapshot(snapshot));

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
        result: answer(body.method, body.params ?? [], {
          versions: { issuers: 1n, sanctions: 1n, revocations: 1n },
        }),
      },
    });
  });
  await page.route(`${FILE.listsUrl}/sanctions-latest.json`, (route) =>
    route.fulfill({
      headers: cors,
      body: serializeSnapshot(snapshot),
      contentType: "application/json",
    }),
  );
  await page.route(`${FILE.listsUrl}/revocations-latest.json`, (route) =>
    route.fulfill({
      headers: cors,
      body: serializeSetSnapshot(issuer.revocations()),
      contentType: "application/json",
    }),
  );
  await page.route(`${FILE.issuerUrl}/issuer`, (route) =>
    route.fulfill({
      headers: cors,
      json: { Ax: key.Ax.toString(), Ay: key.Ay.toString() },
    }),
  );
  return issuer;
}

export async function openReadOnly(page: Page, route: string) {
  await page.goto(`/#/${route}`);
  await page.getByLabel("Read-only address").fill("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
  await page.getByRole("button", { name: "Open read-only" }).click();
}

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { answer, FILE } from "../test/support/fakeChain.ts";
import { answerBatched } from "../test/support/multicall.ts";

async function stub(page: Page, options: { chainId?: number } = {}) {
  await page.route("**/deployment.json", (route) => route.fulfill({ json: FILE }));
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
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
        result: answerBatched(body.method, body.params ?? [], (m, p) => answer(m, p)),
      },
    });
  });
  await page.addInitScript(
    ({ chainId }) => {
      let current = chainId;
      const address = "0x70997970C51812dc3A010C7d01b50e0d17dC79C8";
      const listeners: Record<string, ((value: unknown) => void)[]> = {};
      const provider = {
        request: async ({ method, params }: { method: string; params?: { chainId: string }[] }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
          if (method === "eth_chainId") return `0x${current.toString(16)}`;
          if (method === "wallet_switchEthereumChain") {
            current = Number(BigInt(params?.[0]?.chainId ?? "0x0"));
            for (const l of listeners.chainChanged ?? []) l(`0x${current.toString(16)}`);
            return null;
          }
          throw new Error(`unsupported ${method}`);
        },
        on: (event: string, l: (value: unknown) => void) => {
          const list = listeners[event] ?? [];
          list.push(l);
          listeners[event] = list;
        },
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
    },
    { chainId: options.chainId ?? 5042 },
  );
}

test("connects, shows the shell and passes an accessibility scan", async ({ page }) => {
  await stub(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect a wallet" })).toBeVisible();
  await page.getByRole("button", { name: /test wallet/i }).click();
  await expect(page.getByText("ARC MAINNET")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
});

test("blocks a wallet on the wrong network", async ({ page }) => {
  await stub(page, { chainId: 1 });
  await page.goto("/");
  await page.getByRole("button", { name: /test wallet/i }).click();
  await expect(page.getByRole("heading", { name: "Switch to Arc" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to Arc" }).click();
  await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
});

test("is usable by keyboard alone", async ({ page }) => {
  await stub(page);
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("button", { name: /test wallet/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
});

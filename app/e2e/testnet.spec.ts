import { readFileSync as read, readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { circuitFiles } from "./real.support.ts";
import { cors } from "./support.ts";

const DIR = "/Users/david/Projects/arc-micro/.testnet";
const RPC = "https://rpc.testnet.arc.io";
const ISSUER = "http://127.0.0.1:8787";
const USDC: Address = "0x3600000000000000000000000000000000000000";
const EURC: Address = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const wallets = json(`${DIR}/wallets.json`) as Record<
  "alice" | "bob",
  { key: `0x${string}`; address: Address }
>;
const deployment = json(`${DIR}/deployment.json`) as Record<string, string | number>;
const adminToken = /ADMIN_TOKEN=(\S+)/.exec(readFileSync(`${DIR}/env.sh`, "utf8"))?.[1] ?? "";

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC) });

const file = {
  ...deployment,
  rpcUrl: RPC,
  issuerUrl: "https://issuer.local.test",
  listsUrl: "https://lists.local.test",
  assetsUrl: "https://assets.local.test/circuit",
  tokens: [
    { address: USDC, symbol: "USDC", decimals: 6 },
    { address: EURC, symbol: "EURC", decimals: 6 },
  ],
};

async function wire(page: Page, who: "alice" | "bob") {
  const { key, address } = wallets[who];
  const wallet = createWalletClient({
    account: privateKeyToAccount(key),
    chain: arcTestnet,
    transport: http(RPC),
  });
  await page.exposeFunction("keelsonWallet", async (method: string, params: unknown[]) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
    if (method === "eth_chainId") return `0x${arcTestnet.id.toString(16)}`;
    if (method === "eth_sendTransaction") {
      const tx = params[0] as {
        to: Address;
        data: `0x${string}`;
        value?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      };
      return wallet
        .sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas
            ? BigInt(tx.maxPriorityFeePerGas)
            : undefined,
        })
        .catch((error: { shortMessage?: string; details?: string; message: string }) => {
          console.log(
            "wallet error:",
            who,
            error.shortMessage ?? error.message,
            error.details ?? "",
          );
          throw error;
        });
    }
    throw new Error(`the test wallet does not handle ${method}`);
  });
  await page.addInitScript(() => {
    const provider = {
      request: ({ method, params }: { method: string; params?: unknown[] }) =>
        (
          window as unknown as { keelsonWallet: (m: string, p: unknown[]) => Promise<unknown> }
        ).keelsonWallet(method, params ?? []),
      on: () => undefined,
      removeListener: () => undefined,
    };
    window.addEventListener("eip6963:requestProvider", () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: { uuid: "test", name: "Test wallet", icon: "data:,", rdns: "test" },
            provider,
          },
        }),
      ),
    );
  });

  await page.route("**/deployment.json", (route) => route.fulfill({ json: file }));
  const body = (text: string) => ({ headers: cors, body: text, contentType: "application/json" });
  await page.route("https://lists.local.test/sanctions-latest.json", (r) =>
    r.fulfill(body(readFileSync(`${DIR}/data/keeper/sanctions-latest.json`, "utf8"))),
  );
  await page.route("https://lists.local.test/revocations-latest.json", (r) =>
    r.fulfill(body(readFileSync(`${DIR}/data/keeper/revocations-latest.json`, "utf8"))),
  );
  await page.route("https://issuer.local.test/issuer", async (r) =>
    r.fulfill(body(await (await fetch(`${ISSUER}/issuer`)).text())),
  );
  for (const [name, path] of [
    ["compliance.wasm", circuitFiles.wasm],
    ["compliance.zkey", circuitFiles.zkey],
  ] as const) {
    const bytes = read(path);
    await page.route(`https://assets.local.test/circuit/${name}`, (route) =>
      route.fulfill({
        headers: { ...cors, "content-length": String(bytes.length) },
        body: bytes,
        contentType: "application/octet-stream",
      }),
    );
  }
}

async function issue(subject: string, address: Address, lei: string): Promise<string> {
  const response = await fetch(`${ISSUER}/credentials`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      subject,
      tier: 2,
      jurisdiction: 840,
      expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      identifiers: [
        { kind: "id", value: lei },
        { kind: "address", value: address },
      ],
      entityRef: `testnet ${lei}`,
    }),
  });
  if (!response.ok)
    throw new Error(`the issuer refused: ${response.status} ${await response.text()}`);
  return response.text();
}

async function onboard(page: Page, who: "alice" | "bob", lei: string) {
  await wire(page, who);
  await page.goto("/#/credential");
  await page.getByRole("button", { name: /test wallet/i }).click();
  await page.getByLabel("Passphrase", { exact: true }).fill("a long enough passphrase");
  await page.getByLabel("Repeat the passphrase").fill("a long enough passphrase");
  await page.getByRole("button", { name: "Create the vault" }).click();
  await expect(page.getByRole("heading", { name: "Your subject" })).toBeVisible();
  const subject = (await page.locator(".subject").textContent()) ?? "";
  await page
    .getByLabel("Credential from your issuer")
    .fill(await issue(subject, wallets[who].address, lei));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("list", { name: "Held credentials" })).toContainText("Valid");
}

const balance = (token: Address, owner: Address) =>
  publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });

async function runLeg(page: Page, label: RegExp) {
  await page.getByRole("button", { name: /prove and attest/i }).click();
  const approve = page.getByRole("button", { name: /^approve/i });
  const commit = page.getByRole("button", { name: /commit to the terms/i });
  await expect(approve.or(commit)).toBeVisible({ timeout: 300_000 });
  if (await approve.isVisible()) {
    await approve.click();
    await expect(commit).toBeVisible({ timeout: 120_000 });
  }
  await commit.click();
  await expect(page.getByRole("article", { name: label }).getByText("Done")).toHaveCount(4, {
    timeout: 120_000,
  });
}

test("two parties settle a private trade on Arc testnet through the browser", async ({
  browser,
}) => {
  expect((await fetch(`${ISSUER}/health`)).ok, "the local issuer must be running").toBe(true);
  const before = {
    aliceUsdc: await balance(USDC, wallets.alice.address),
    aliceEurc: await balance(EURC, wallets.alice.address),
    bobUsdc: await balance(USDC, wallets.bob.address),
    bobEurc: await balance(EURC, wallets.bob.address),
  };

  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  for (const page of [alice, bob])
    page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await onboard(alice, "alice", "LEI 5493001KJTIIGC8Y1R12");
  await onboard(bob, "bob", "LEI 254900HROIFWPRGM1V77");

  await alice.evaluate(() => {
    window.location.hash = "#/trades";
  });
  await alice.getByLabel("send amount").fill("2");
  await alice.getByLabel("receive amount").fill("1.8");
  await alice.getByLabel("Counterparty address").fill(wallets.bob.address);
  await alice.getByRole("button", { name: "Create the trade" }).click();
  await alice.getByRole("button", { name: "Show the private link" }).click();
  const link = await alice.getByLabel("Private trade link").inputValue();
  await alice.getByRole("button", { name: "Open the room" }).click();
  await bob.evaluate(
    (hash) => {
      window.location.hash = hash;
    },
    `#/trade/${link.split("/#/trade/")[1]}`,
  );
  await expect(bob.getByRole("heading", { name: /2 USDC.*1.8 EURC/ })).toBeVisible();

  await Promise.all([runLeg(alice, /Leg A, seller/), runLeg(bob, /Leg B, buyer/)]);
  await expect(alice.getByText(/both legs are ready to settle/i)).toBeVisible({ timeout: 60_000 });
  await alice.getByRole("button", { name: "Settle both legs" }).click();
  await expect(alice.getByText(/settled\. both legs moved/i)).toBeVisible({ timeout: 120_000 });
  await expect(bob.getByText(/settled\. both legs moved/i)).toBeVisible({ timeout: 60_000 });

  const after = {
    aliceEurc: await balance(EURC, wallets.alice.address),
    bobEurc: await balance(EURC, wallets.bob.address),
    aliceUsdc: await balance(USDC, wallets.alice.address),
    bobUsdc: await balance(USDC, wallets.bob.address),
  };
  expect(after.aliceEurc - before.aliceEurc).toBe(parseUnits("1.8", 6));
  expect(before.bobEurc - after.bobEurc).toBe(parseUnits("1.8", 6));
  const near = (delta: bigint, expected: string) =>
    expect(Number(formatUnits(delta < 0n ? -delta : delta, 6))).toBeGreaterThan(
      Number(expected) - 0.001,
    );
  near(before.aliceUsdc - after.aliceUsdc, "2");
  near(after.bobUsdc - before.bobUsdc + parseUnits("0.5", 6), "2");
  console.log("settled on Arc testnet", deployment.settlement);
});

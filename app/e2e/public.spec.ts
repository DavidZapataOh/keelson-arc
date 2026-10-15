import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

/**
 * Drives the published site on Arc testnet, end to end, with two wallets that sign in this process.
 * Everything else is the live deployment: its contracts, issuer, lists and circuit files.
 */
const DIR = "/Users/david/Projects/arc-micro/.testnet";
const RPC = "https://rpc.testnet.arc.io";
const EURC: Address = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const wallets = JSON.parse(readFileSync(`${DIR}/wallets.json`, "utf8")) as Record<
  "alice" | "bob",
  { key: `0x${string}`; address: Address }
>;
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC) });

async function connectWallet(page: Page, who: "alice" | "bob") {
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
      return wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : 0n,
        maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
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
}

async function onboard(page: Page, who: "alice" | "bob") {
  await connectWallet(page, who);
  await page.goto("/#/credential");
  await page.getByRole("button", { name: /test wallet/i }).click();
  await page.getByLabel("Passphrase", { exact: true }).fill("a long enough passphrase");
  await page.getByLabel("Repeat the passphrase").fill("a long enough passphrase");
  await page.getByRole("button", { name: "Create the vault" }).click();
  await page.getByRole("button", { name: "Get a demo credential" }).click();
  await expect(page.getByRole("list", { name: "Held credentials" })).toContainText("Valid", {
    timeout: 60_000,
  });
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

test("two parties settle a private trade on the published testnet site", async ({ browser }) => {
  const before = {
    aliceEurc: await balance(EURC, wallets.alice.address),
    bobEurc: await balance(EURC, wallets.bob.address),
  };
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  for (const page of [alice, bob])
    page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await onboard(alice, "alice");
  await onboard(bob, "bob");

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

  expect((await balance(EURC, wallets.alice.address)) - before.aliceEurc).toBe(
    parseUnits("1.8", 6),
  );
  expect(before.bobEurc - (await balance(EURC, wallets.bob.address))).toBe(parseUnits("1.8", 6));
});

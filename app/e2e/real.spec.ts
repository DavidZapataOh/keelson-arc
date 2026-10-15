import { resolve } from "node:path";
import { IssuerService, Store } from "@keelson/issuer";
import { buildFromSource, openSnapshot, serializeSnapshot } from "@keelson/lists";
import {
  feeParams,
  ISSUER_DEPTH,
  issuedToJson,
  issuerFromKey,
  issuerLeaf,
  MerkleTree,
  regulatorPublicKey,
  rootRegistryAbi,
  serializeSetSnapshot,
} from "@keelson/sdk";
import { expect, type Page, test } from "@playwright/test";
import { type Address, parseUnits } from "viem";
import {
  accountOf,
  deploySystem,
  deployToken,
  type LocalChain,
  startChain,
  tokenAbi,
} from "../../e2e/test/support/chain.ts";
import { type Wiring, wire } from "./real.support.ts";

const SAMPLE = resolve(
  new URL("../../lists/test/fixtures/sdn_advanced_sample.xml", import.meta.url).pathname,
);

let chain: LocalChain;
let wiring: Wiring;
let issuer: IssuerService;
let asset: Address;
let cash: Address;

const seller = accountOf("seller").address;
const buyer = accountOf("buyer").address;

test.beforeAll(async () => {
  chain = await startChain();
  const regulator = regulatorPublicKey(987654321n);
  const deployment = deploySystem(chain, {
    regulatorKeyX: regulator.x,
    regulatorKeyY: regulator.y,
  });

  const { snapshot } = await buildFromSource(SAMPLE, 18);
  const key = issuerFromKey(new Uint8Array(32).fill(7));
  issuer = new IssuerService(key, new Store(":memory:"), openSnapshot(snapshot));

  const publish = async (registry: Address, root: bigint) => {
    const owner = chain.wallet("owner");
    const hash = await owner.writeContract({
      address: registry,
      abi: rootRegistryAbi,
      functionName: "publish",
      args: [root],
      account: owner.account as NonNullable<typeof owner.account>,
      chain: chain.chain,
      ...(await feeParams(chain.publicClient)),
    });
    await chain.publicClient.waitForTransactionReceipt({ hash });
  };
  await publish(deployment.issuers, new MerkleTree(ISSUER_DEPTH, [issuerLeaf(key)]).root);
  await publish(deployment.sanctions, openSnapshot(snapshot).root);
  const revocations = issuer.revocations();
  await publish(deployment.revocations, BigInt(revocations.root));

  asset = (await deployToken(chain, "ASSET")) as Address;
  cash = (await deployToken(chain, "CASH")) as Address;
  const owner = chain.wallet("owner");
  for (const [token, to, amount] of [
    [asset, seller, parseUnits("1000", 6)],
    [cash, buyer, parseUnits("1500", 6)],
  ] as const) {
    const hash = await owner.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "mint",
      args: [to, amount],
      account: owner.account as NonNullable<typeof owner.account>,
      chain: chain.chain,
      ...(await feeParams(chain.publicClient)),
    });
    await chain.publicClient.waitForTransactionReceipt({ hash });
  }

  wiring = {
    rpcUrl: chain.url,
    chainId: chain.chain.id,
    deployment: {
      ...deployment,
      rpcUrl: "https://rpc.local.test",
      issuerUrl: "https://issuer.local.test",
      listsUrl: "https://lists.local.test",
      assetsUrl: "https://assets.local.test/circuit",
    },
    sanctionsJson: serializeSnapshot(snapshot),
    revocationsJson: () => serializeSetSnapshot(issuer.revocations()),
    issuerKey: { Ax: key.Ax.toString(), Ay: key.Ay.toString() },
  };
});

test.afterAll(() => chain?.stop());

async function connectAndOnboard(page: Page, account: Address, lei: string) {
  await wire(page, wiring, account);
  await page.goto("/#/credential");
  await page.getByRole("button", { name: /local wallet/i }).click();
  await page.getByLabel("Passphrase", { exact: true }).fill("a long enough passphrase");
  await page.getByLabel("Repeat the passphrase").fill("a long enough passphrase");
  await page.getByRole("button", { name: "Create the vault" }).click();
  await expect(page.getByRole("heading", { name: "Your subject" })).toBeVisible();
  const subject = (await page.locator(".subject").textContent()) ?? "";
  const issued = issuer.issue({
    subject: BigInt(subject),
    tier: 2,
    jurisdiction: 840,
    expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    identifiers: [
      { kind: "id", value: lei },
      { kind: "address", value: account },
    ],
    entityRef: `case ${lei}`,
  });
  await page.getByLabel("Credential from your issuer").fill(JSON.stringify(issuedToJson(issued)));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("list", { name: "Held credentials" })).toContainText("Valid");
}

const FIVE_MINUTES = 300_000;

async function runLeg(page: Page, label: RegExp) {
  await page.getByRole("button", { name: /prove and attest/i }).click();
  const approve = page.getByRole("button", { name: /^approve/i });
  await expect(approve).toBeVisible({ timeout: FIVE_MINUTES });
  await approve.click();
  const commit = page.getByRole("button", { name: /commit to the terms/i });
  await expect(commit).toBeVisible({ timeout: 60_000 });
  await commit.click();
  const leg = page.getByRole("article", { name: label });
  await expect(leg.getByText("Done")).toHaveCount(4, { timeout: 60_000 });
}

test("two parties settle a private trade through the browser against the real contracts", async ({
  browser,
}) => {
  const sellerPage = await (await browser.newContext()).newPage();
  const buyerPage = await (await browser.newContext()).newPage();
  for (const page of [sellerPage, buyerPage]) {
    page.on("pageerror", (error) => console.log("pageerror:", error.message));
  }

  await connectAndOnboard(sellerPage, seller, "LEI 5493001KJTIIGC8Y1R12");
  await connectAndOnboard(buyerPage, buyer, "LEI 254900HROIFWPRGM1V77");

  await sellerPage.evaluate(() => {
    window.location.hash = "#/trades";
  });
  await sellerPage.getByLabel("send token", { exact: true }).selectOption("custom");
  await sellerPage.getByLabel("send token address").fill(asset);
  await sellerPage.getByLabel("send amount").fill("1000");
  await sellerPage.getByLabel("receive token", { exact: true }).selectOption("custom");
  await sellerPage.getByLabel("receive token address").fill(cash);
  await sellerPage.getByLabel("receive amount").fill("1500");
  await sellerPage.getByLabel("Counterparty address").fill(buyer);
  await sellerPage.getByRole("button", { name: "Create the trade" }).click();
  await sellerPage.getByRole("button", { name: "Show the private link" }).click();
  const link = await sellerPage.getByLabel("Private trade link").inputValue();
  await sellerPage.getByRole("button", { name: "Open the room" }).click();

  await buyerPage.evaluate(
    (hash) => {
      window.location.hash = hash;
    },
    `#/trade/${link.split("/#/trade/")[1]}`,
  );
  await expect(buyerPage.getByRole("heading", { name: /1,000 ASSET.*1,500 CASH/ })).toBeVisible();

  await Promise.all([runLeg(sellerPage, /Leg A, seller/), runLeg(buyerPage, /Leg B, buyer/)]);

  await expect(sellerPage.getByText(/both legs are ready to settle/i)).toBeVisible({
    timeout: 30_000,
  });
  await sellerPage.getByRole("button", { name: "Settle both legs" }).click();
  await expect(sellerPage.getByText(/settled\. both legs moved/i)).toBeVisible({ timeout: 60_000 });
  await expect(buyerPage.getByText(/settled\. both legs moved/i)).toBeVisible({ timeout: 30_000 });

  const balance = (token: Address, owner: Address) =>
    chain.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [owner],
    });
  expect(await balance(asset, buyer)).toBe(parseUnits("1000", 6));
  expect(await balance(asset, seller)).toBe(0n);
  expect(await balance(cash, seller)).toBe(parseUnits("1500", 6));
  expect(await balance(cash, buyer)).toBe(0n);
});

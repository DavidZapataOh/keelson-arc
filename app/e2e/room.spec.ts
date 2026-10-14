import { hashTerms } from "@keelson/sdk/trade";
import { expect, type Page, test } from "@playwright/test";
import { getAddress } from "viem";
import { decodePackage } from "../src/trade/package.ts";
import { FILE } from "../test/support/fakeChain.ts";
import { allowanceKey, balanceKey, newWorld, partyKey } from "../test/support/world.ts";
import { installWallet, serveChain } from "./room.support.ts";

const SELLER = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const BUYER = getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");
const USDC = getAddress("0x3600000000000000000000000000000000000000");
const EURC = getAddress("0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1");

async function enter(page: Page, world: ReturnType<typeof newWorld>, wallet: string, path = "/") {
  await serveChain(page, world);
  await installWallet(page, wallet);
  await page.goto(path);
  await page.getByRole("button", { name: /test wallet/i }).click();
}

test("two parties open the same room from a private link and follow each other through the chain", async ({
  browser,
}) => {
  const world = newWorld(Math.floor(Date.now() / 1000));
  world.balance.set(balanceKey(USDC, SELLER), 10n ** 15n);
  world.balance.set(balanceKey(EURC, BUYER), 10n ** 15n);

  const sellerPage = await (await browser.newContext()).newPage();
  await enter(sellerPage, world, SELLER);
  await sellerPage.getByLabel("send amount").fill("25,000,000");
  await sellerPage.getByLabel("receive amount").fill("22,950,000");
  await sellerPage.getByLabel("Counterparty address").fill(BUYER);
  await sellerPage.getByRole("button", { name: "Create the trade" }).click();
  await sellerPage.getByRole("button", { name: "Show the private link" }).click();
  const link = await sellerPage.getByLabel("Private trade link").inputValue();
  const pkg = decodePackage(link.split("/#/trade/")[1] ?? "");
  await sellerPage.getByRole("button", { name: "Open the room" }).click();
  await expect(sellerPage.getByRole("heading", { name: /25,000,000 USDC/ })).toBeVisible();

  const buyerPage = await (await browser.newContext()).newPage();
  await enter(buyerPage, world, BUYER, "/");
  await buyerPage.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(
    buyerPage.getByRole("heading", { name: /25,000,000 USDC.*22,950,000 EURC/ }),
  ).toBeVisible();
  const buyerLeg = buyerPage.getByRole("article", { name: /Leg B, buyer/ });
  await expect(buyerLeg.getByText("YOU", { exact: true })).toBeVisible();
  await expect(
    buyerLeg.getByRole("img", { name: /counterparty identity is private/i }),
  ).toBeVisible();

  const hash = hashTerms({
    settlement: FILE.settlement,
    chainId: FILE.chainId,
    tradeId: pkg.tradeId,
    terms: pkg.terms,
    salt: pkg.salt,
  });
  world.compliant.add(partyKey(SELLER));
  world.allowance.set(allowanceKey(USDC, SELLER), pkg.terms.sellAmount);
  world.commitments.set(partyKey(SELLER), hash);

  const sellerOnBuyerSide = buyerPage.getByRole("article", { name: /Leg A, seller/ });
  await expect(sellerOnBuyerSide.getByText("Done")).toHaveCount(4, { timeout: 15_000 });
  await expect(buyerPage.getByText(/waiting for the buyer's proof/i)).toBeVisible();
  await expect(buyerLeg.getByText("Your next step")).toBeVisible();

  world.compliant.add(partyKey(BUYER));
  world.allowance.set(allowanceKey(EURC, BUYER), pkg.terms.payAmount);
  world.commitments.set(partyKey(BUYER), hash);
  await expect(buyerPage.getByText(/both legs are ready to settle/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(sellerPage.getByText(/both legs are ready to settle/i)).toBeVisible({
    timeout: 15_000,
  });

  world.settled = true;
  await expect(sellerPage.getByText(/settled\. both legs moved/i)).toBeVisible({ timeout: 15_000 });

  await buyerPage.reload();
  await buyerPage.getByRole("button", { name: /test wallet/i }).click();
  await expect(buyerPage.getByText(/settled\. both legs moved/i)).toBeVisible();
});

test("an edited link shows that it does not open", async ({ page }) => {
  await enter(page, newWorld(), SELLER, "/#/trade/not-a-trade-not-a-trade-not-a-trade-not-a-trade");
  await expect(page.getByRole("heading", { name: "This link does not open" })).toBeVisible();
});

import { issuedToJson } from "@keelson/sdk";
import { expect, test } from "@playwright/test";
import { openReadOnly, serveLists } from "./support.ts";

test("onboards a holder with a credential from the real issuer and follows its revocation", async ({
  page,
}) => {
  const issuer = await serveLists(page);
  await openReadOnly(page, "lists");

  const rows = page.getByRole("listitem");
  await expect(rows.filter({ hasText: "Sanctions" })).toContainText("Accepted by the contract");
  await expect(rows.filter({ hasText: "Issuers" })).toContainText("Accepted by the contract");

  await page.getByRole("link", { name: "Credential" }).click();
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
      { kind: "id", value: "529900T8BM49AURSDO55" },
      { kind: "address", value: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" },
    ],
    entityRef: "case 1",
  });
  await page.getByLabel("Credential from your issuer").fill(JSON.stringify(issuedToJson(issued)));
  await page.getByRole("button", { name: "Import", exact: true }).click();

  const held = page.getByRole("list", { name: "Held credentials" });
  await expect(held).toContainText("Tier 2");
  await expect(held).toContainText("Valid");

  issuer.revoke(issued.claims.credentialId);
  await page.getByRole("link", { name: "Lists" }).click();
  await page.getByRole("button", { name: "Download the lists again" }).click();
  await expect(page.getByRole("button", { name: "Download the lists again" })).toBeVisible();
  await page.getByRole("link", { name: "Credential" }).click();
  await expect(page.getByRole("list", { name: "Held credentials" })).toContainText("Revoked");
});

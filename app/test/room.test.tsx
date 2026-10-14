import "fake-indexeddb/auto";
import { hashTerms } from "@keelson/sdk/trade";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import type { ListsEngine } from "../src/lists/engine.ts";
import { decodePackage, encodePackage, type TradePackage } from "../src/trade/package.ts";
import { FILE } from "./support/fakeChain.ts";
import {
  allowanceKey,
  balanceKey,
  newWorld,
  partyKey,
  type World,
  worldClient,
} from "./support/world.ts";

const SELLER = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const BUYER = getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");
const OUTSIDER = getAddress("0x90f79bf6eb2c4f870365e785982e1f101e93b906");
const USDC = getAddress("0x3600000000000000000000000000000000000000");
const EURC = getAddress("0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1");

const pkg: TradePackage = {
  tradeId: 4242n,
  salt: `0x${"cd".repeat(32)}`,
  terms: {
    seller: SELLER,
    buyer: BUYER,
    sellToken: USDC,
    sellAmount: 25_000_000_000_000n,
    payToken: EURC,
    payAmount: 22_950_000_000_000n,
    expiry: 1_800_003_600n,
  },
};
const hash = hashTerms({
  settlement: FILE.settlement,
  chainId: FILE.chainId,
  tradeId: pkg.tradeId,
  terms: pkg.terms,
  salt: pkg.salt,
});

const engine = (): ListsEngine => ({
  load: async () => ({
    roots: { issuers: 1n, sanctions: 2n, revocations: 3n },
    sanctionsIssued: undefined,
    revocationsUpdatedAt: undefined,
    fetchedAt: 0,
  }),
  revoked: async (ids) => ids.map(() => false),
});

const funded = () => {
  const world = newWorld();
  world.balance.set(balanceKey(USDC, SELLER), pkg.terms.sellAmount);
  world.balance.set(balanceKey(EURC, BUYER), pkg.terms.payAmount);
  return world;
};

async function enter(world: World, hash: string, address = SELLER) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(
    <App load={async () => ({ file: FILE, client: worldClient(world) })} makeEngine={engine} />,
  );
  await user.type(await screen.findByLabelText(/read-only address/i), address);
  await user.click(screen.getByRole("button", { name: /open read-only/i }));
  return user;
}

const room = (world: World, address = SELLER) =>
  enter(world, `#/trade/${encodePackage(pkg)}`, address);

const leg = (name: RegExp) => screen.findByRole("article", { name });
const statuses = (el: HTMLElement) =>
  within(el)
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-status"));

afterEach(() => {
  window.location.hash = "";
});

describe("trade room", () => {
  it("shows the trade, both legs and marks the connected party", async () => {
    await room(funded());
    expect(
      await screen.findByRole("heading", { name: /25,000,000 USDC.*22,950,000 EURC/ }),
    ).toBeInTheDocument();
    const seller = await leg(/Leg A, seller/);
    const buyer = await leg(/Leg B, buyer/);
    expect(within(seller).getByText("YOU")).toBeInTheDocument();
    expect(within(buyer).queryByText("YOU")).not.toBeInTheDocument();
    expect(
      within(seller).getByRole("img", { name: /counterparty identity is private/i }),
    ).toBeInTheDocument();
    expect(statuses(seller)).toEqual(["current", "waiting", "waiting", "waiting"]);
    expect(statuses(buyer)).toEqual(["waiting", "waiting", "waiting", "waiting"]);
    expect(screen.getByText(/waiting for the seller's proof/i)).toBeInTheDocument();
  });

  it("reflects what the chain says about each leg", async () => {
    const world = newWorld();
    world.compliant.add(partyKey(SELLER));
    world.allowance.set(allowanceKey(USDC, SELLER), pkg.terms.sellAmount);
    world.balance.set(balanceKey(USDC, SELLER), pkg.terms.sellAmount);
    world.commitments.set(partyKey(SELLER), hash);
    world.compliant.add(partyKey(BUYER));
    await room(world);
    expect(statuses(await leg(/Leg A, seller/))).toEqual(["done", "done", "done", "done"]);
    expect(statuses(await leg(/Leg B, buyer/))).toEqual(["done", "done", "blocked", "waiting"]);
    expect(screen.getByText("Balance is too low")).toBeInTheDocument();
  });

  it("says both legs are ready only when both are complete and funded", async () => {
    const world = newWorld();
    for (const [party, token, amount] of [
      [SELLER, USDC, pkg.terms.sellAmount],
      [BUYER, EURC, pkg.terms.payAmount],
    ] as const) {
      world.compliant.add(partyKey(party));
      world.allowance.set(allowanceKey(token, party), amount);
      world.balance.set(balanceKey(token, party), amount);
      world.commitments.set(partyKey(party), hash);
    }
    await room(world);
    expect(await screen.findByText(/both legs are ready to settle/i)).toBeInTheDocument();
  });

  it("flags a counterparty who committed to different terms", async () => {
    const world = newWorld();
    world.compliant.add(partyKey(BUYER));
    world.allowance.set(allowanceKey(EURC, BUYER), pkg.terms.payAmount);
    world.commitments.set(partyKey(BUYER), `0x${"11".repeat(32)}`);
    await room(world);
    expect(await screen.findByText("Committed to different terms")).toBeInTheDocument();
  });

  it("is an observer for a wallet that is neither party", async () => {
    await room(funded(), OUTSIDER);
    expect(await screen.findByText(/neither party of this trade/i)).toBeInTheDocument();
    const seller = await leg(/Leg A, seller/);
    expect(statuses(seller)).toEqual(["waiting", "waiting", "waiting", "waiting"]);
  });

  it("shows settled and expired trades and stops offering steps", async () => {
    const settled = newWorld();
    settled.settled = true;
    await room(settled);
    expect(await screen.findByText(/settled\. both legs moved/i)).toBeInTheDocument();
    expect(statuses(await leg(/Leg A, seller/))).toEqual(["done", "done", "done", "done"]);
  });

  it("shows an expired trade as blocked", async () => {
    const expired = newWorld(Number(pkg.terms.expiry) + 10);
    await room(expired);
    expect(await screen.findByText(/this trade expired/i)).toBeInTheDocument();
    expect(statuses(await leg(/Leg A, seller/))).toEqual([
      "blocked",
      "blocked",
      "blocked",
      "blocked",
    ]);
  });

  it("rejects a link that was cut or edited, with a way back", async () => {
    await enter(newWorld(), `#/trade/${encodePackage(pkg).slice(0, -12)}`);
    expect(
      await screen.findByRole("heading", { name: /this link does not open/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to trades/i })).toBeInTheDocument();
  });
});

describe("new trade", () => {
  it("creates a trade whose private link carries exactly the terms entered", async () => {
    const user = await enter(newWorld(), "#/trades");
    await user.type(await screen.findByLabelText("send amount"), "25,000,000");
    await user.type(screen.getByLabelText("receive amount"), "22,950,000");
    await user.type(screen.getByLabelText("Counterparty address"), BUYER);
    await user.click(screen.getByRole("button", { name: /create the trade/i }));

    expect(
      await screen.findByRole("heading", { name: /your trade is ready/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/private trade link/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show the private link/i }));
    const link = (screen.getByLabelText(/private trade link/i) as HTMLInputElement).value;
    const created = decodePackage(link.split("/#/trade/")[1] as string);
    expect(created.terms).toMatchObject({
      seller: SELLER,
      buyer: BUYER,
      sellToken: USDC,
      sellAmount: 25_000_000_000_000n,
      payToken: EURC,
      payAmount: 22_950_000_000_000n,
    });
    expect(created.salt).toMatch(/^0x[0-9a-f]{64}$/);

    await user.click(screen.getByRole("button", { name: /open the room/i }));
    expect(
      await screen.findByRole("heading", { name: /25,000,000 USDC.*22,950,000 EURC/ }),
    ).toBeInTheDocument();
  }, 30_000);

  it("puts the wallet on the buyer side when the user is buying", async () => {
    const user = await enter(newWorld(), "#/trades");
    await user.click(await screen.findByRole("radio", { name: /the buyer/i }));
    await user.type(screen.getByLabelText("send amount"), "22,950,000");
    await user.type(screen.getByLabelText("receive amount"), "25,000,000");
    await user.selectOptions(screen.getByLabelText("send token"), EURC);
    await user.selectOptions(screen.getByLabelText("receive token"), USDC);
    await user.type(screen.getByLabelText("Counterparty address"), BUYER);
    await user.click(screen.getByRole("button", { name: /create the trade/i }));
    await user.click(await screen.findByRole("button", { name: /show the private link/i }));
    const link = (screen.getByLabelText(/private trade link/i) as HTMLInputElement).value;
    const created = decodePackage(link.split("/#/trade/")[1] as string);
    expect(created.terms).toMatchObject({
      buyer: SELLER,
      seller: BUYER,
      sellToken: USDC,
      sellAmount: 25_000_000_000_000n,
      payToken: EURC,
      payAmount: 22_950_000_000_000n,
    });
  }, 30_000);

  it("says what is wrong instead of creating a broken trade", async () => {
    const user = await enter(newWorld(), "#/trades");
    await user.type(await screen.findByLabelText("send amount"), "1");
    await user.type(screen.getByLabelText("receive amount"), "1");
    await user.type(screen.getByLabelText("Counterparty address"), SELLER);
    await user.click(screen.getByRole("button", { name: /create the trade/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/different addresses/i);
    expect(screen.queryByRole("heading", { name: /your trade is ready/i })).not.toBeInTheDocument();
  });

  it("opens a trade from a pasted private link", async () => {
    const user = await enter(newWorld(), "#/trades");
    await user.type(await screen.findByLabelText(/private link from the other party/i), "nope");
    await user.click(screen.getByRole("button", { name: /open the trade/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/whole private link/i);
    await user.clear(screen.getByLabelText(/private link from the other party/i));
    await user.click(screen.getByLabelText(/private link from the other party/i));
    await user.paste(`https://app.keelson.finance/#/trade/${encodePackage(pkg)}`);
    await user.click(screen.getByRole("button", { name: /open the trade/i }));
    expect(await screen.findByRole("heading", { name: /25,000,000 USDC/ })).toBeInTheDocument();
  });
});

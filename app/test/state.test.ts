import { hashTerms } from "@keelson/sdk/trade";
import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import type { TradePackage } from "../src/trade/package.ts";
import { readTrade, roleOf, watchTrade } from "../src/trade/state.ts";
import { FILE } from "./support/fakeChain.ts";
import { allowanceKey, balanceKey, newWorld, partyKey, worldClient } from "./support/world.ts";

const SELLER = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const BUYER = getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");
const SELL_TOKEN = getAddress("0x3600000000000000000000000000000000000000");
const PAY_TOKEN = getAddress("0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1");

const pkg: TradePackage = {
  tradeId: 99n,
  salt: `0x${"cd".repeat(32)}`,
  terms: {
    seller: SELLER,
    buyer: BUYER,
    sellToken: SELL_TOKEN,
    sellAmount: 25_000_000_000_000n,
    payToken: PAY_TOKEN,
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

const read = (world = newWorld()) => readTrade({ file: FILE, client: worldClient(world) }, pkg);

describe("trade state", () => {
  it("reads a fresh trade as untouched", async () => {
    const state = await read();
    expect(state.termsHash).toBe(hash);
    expect(state.legs.seller).toEqual({
      compliant: false,
      committed: false,
      matches: false,
      allowance: 0n,
      balance: 0n,
    });
    expect(state.legs.buyer.compliant).toBe(false);
    expect(state.settled).toBe(false);
    expect(state.expired).toBe(false);
  });

  it("follows attest, approve and commit leg by leg", async () => {
    const world = newWorld();
    world.compliant.add(partyKey(SELLER));
    world.allowance.set(allowanceKey(SELL_TOKEN, SELLER), pkg.terms.sellAmount);
    world.balance.set(balanceKey(SELL_TOKEN, SELLER), pkg.terms.sellAmount * 2n);
    world.commitments.set(partyKey(SELLER), hash);
    const state = await read(world);
    expect(state.legs.seller).toEqual({
      compliant: true,
      committed: true,
      matches: true,
      allowance: pkg.terms.sellAmount,
      balance: pkg.terms.sellAmount * 2n,
    });
    expect(state.legs.buyer.committed).toBe(false);
  });

  it("flags a commitment to different terms", async () => {
    const world = newWorld();
    world.commitments.set(partyKey(BUYER), `0x${"11".repeat(32)}`);
    const { legs } = await read(world);
    expect(legs.buyer).toMatchObject({ committed: true, matches: false });
  });

  it("reads settled and flips to expired once the chain passes the expiry", async () => {
    const world = newWorld();
    world.settled = true;
    expect((await read(world)).settled).toBe(true);
    world.timestamp = Number(pkg.terms.expiry);
    expect((await read(world)).expired).toBe(false);
    world.timestamp = Number(pkg.terms.expiry) + 1;
    expect((await read(world)).expired).toBe(true);
  });

  it("derives the role of an address from the terms, ignoring case", () => {
    expect(roleOf(pkg, SELLER.toLowerCase() as `0x${string}`)).toBe("seller");
    expect(roleOf(pkg, BUYER)).toBe("buyer");
    expect(roleOf(pkg, getAddress("0x1111111111111111111111111111111111111111"))).toBeUndefined();
  });

  it("watches the chain and stops when asked", async () => {
    vi.useFakeTimers();
    const world = newWorld();
    const seen: boolean[] = [];
    const stop = watchTrade(
      { file: FILE, client: worldClient(world) },
      pkg,
      (s) => seen.push(s.legs.seller.compliant),
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(10);
    world.compliant.add(partyKey(SELLER));
    await vi.advanceTimersByTimeAsync(4100);
    stop();
    await vi.advanceTimersByTimeAsync(9000);
    vi.useRealTimers();
    expect(seen).toEqual([false, true]);
  });
});

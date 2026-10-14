import { arc } from "@keelson/sdk/arc";
import { describe, expect, it, vi } from "vitest";
import { watchWallets } from "../src/wallet/discover.ts";
import { readOnly } from "../src/wallet/readonly.ts";
import { assertArc, connect, WrongChainError } from "../src/wallet/session.ts";
import { testWallet } from "./support/testWallet.ts";

const KEY_A = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY_B = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdd5e8a8";

describe("discovery", () => {
  it("lists wallets as they announce themselves", () => {
    const seen: string[][] = [];
    const stop = watchWallets((wallets) => seen.push(wallets.map((w) => w.info.name)));
    const { wallet } = testWallet({ key: KEY_A });
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: wallet }));
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: wallet }));
    stop();
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: wallet }));
    expect(seen).toEqual([["Test wallet"], ["Test wallet"]]);
  });

  it("asks installed wallets to announce on start", () => {
    const asked = vi.fn();
    window.addEventListener("eip6963:requestProvider", asked);
    watchWallets(() => undefined)();
    window.removeEventListener("eip6963:requestProvider", asked);
    expect(asked).toHaveBeenCalledOnce();
  });
});

describe("session", () => {
  it("connects and exposes the account and chain", async () => {
    const test = testWallet({ key: KEY_A });
    const session = await connect(test.wallet);
    expect(session.snapshot).toEqual({ address: test.account.address, chainId: arc.id });
    expect(session.walletClient?.account?.address).toBe(test.account.address);
    session.close();
  });

  it("blocks sends on the wrong chain until the wallet switches", async () => {
    const test = testWallet({ key: KEY_A, chainId: 1 });
    const session = await connect(test.wallet);
    expect(() => assertArc(session)).toThrow(WrongChainError);
    await session.switchChain();
    expect(() => assertArc(session)).not.toThrow();
    session.close();
  });

  it("adds Arc when the wallet does not know it", async () => {
    const test = testWallet({ key: KEY_A, chainId: 1, knowsArc: false });
    const session = await connect(test.wallet);
    await session.switchChain();
    expect(test.requests.map((r) => r.method)).toContain("wallet_addEthereumChain");
    expect(session.snapshot.chainId).toBe(arc.id);
    session.close();
  });

  it("follows account and chain changes and rebuilds its client", async () => {
    const test = testWallet({ key: KEY_A });
    const other = testWallet({ key: KEY_B }).account.address;
    const session = await connect(test.wallet);
    const changes: unknown[] = [];
    session.onChange((next) => changes.push(next));
    test.changeAccount(other);
    test.changeChain(1);
    expect(changes).toEqual([
      { address: other, chainId: arc.id },
      { address: other, chainId: 1 },
    ]);
    expect(session.walletClient?.account?.address).toBe(other);
    session.close();
  });

  it("removes its listeners when closed", async () => {
    const test = testWallet({ key: KEY_A });
    const session = await connect(test.wallet);
    expect(test.listenerCount("chainChanged")).toBe(1);
    session.close();
    expect(test.listenerCount("chainChanged")).toBe(0);
    expect(test.listenerCount("accountsChanged")).toBe(0);
  });
});

describe("read-only session", () => {
  it("never exposes a wallet client", () => {
    const session = readOnly("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
    expect(session.kind).toBe("readonly");
    expect(session.walletClient).toBeUndefined();
    expect(session.snapshot.address).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(() => assertArc(session)).not.toThrow();
  });
});

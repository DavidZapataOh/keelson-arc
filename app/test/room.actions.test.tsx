import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { issuedToJson, issuerFromKey, signClaims } from "@keelson/sdk";
import { hashTerms } from "@keelson/sdk/trade";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress, type Hex } from "viem";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { encodePackage, type TradePackage } from "../src/trade/package.ts";
import { applyTransaction } from "./support/apply.ts";
import { fakeEngine } from "./support/engine.ts";
import { FILE } from "./support/fakeChain.ts";
import { testWallet } from "./support/testWallet.ts";
import {
  allowanceKey,
  balanceKey,
  newWorld,
  partyKey,
  type World,
  worldClient,
} from "./support/world.ts";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

const KEYS = {
  seller: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  buyer: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
} as const;
const SELLER = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const BUYER = getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");
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
const termsHash = hashTerms({
  settlement: FILE.settlement,
  chainId: FILE.chainId,
  tradeId: pkg.tradeId,
  terms: pkg.terms,
  salt: pkg.salt,
});

const funded = (): World => {
  const world = newWorld();
  world.balance.set(balanceKey(USDC, SELLER), pkg.terms.sellAmount);
  world.balance.set(balanceKey(EURC, BUYER), pkg.terms.payAmount);
  return world;
};

type Options = {
  as?: "seller" | "buyer";
  rejectSend?: boolean;
  engine?: ReturnType<typeof fakeEngine>;
};

async function enter(world: World, options: Options = {}, hash = `#/trade/${encodePackage(pkg)}`) {
  window.location.hash = hash;
  const role = options.as ?? "seller";
  const test = testWallet({
    key: KEYS[role],
    rejectSend: options.rejectSend,
    onSend: (tx) => applyTransaction(world, tx, { token: USDC, sender: test.account.address }),
  });
  const user = userEvent.setup();
  render(
    <App
      load={async () => ({ file: FILE, client: worldClient(world) })}
      makeEngine={options.engine ?? fakeEngine()}
    />,
  );
  await screen.findByRole("heading", { name: /connect a wallet/i });
  act(() => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: test.wallet }));
  });
  await user.click(await screen.findByRole("button", { name: /test wallet/i }));
  return { user, test };
}

const leg = (name: RegExp) => screen.findByRole("article", { name });
const doneCount = (el: HTMLElement) =>
  within(el)
    .getAllByRole("listitem")
    .filter((li) => li.getAttribute("data-status") === "done").length;

beforeEach(() => {
  indexedDB.deleteDatabase("keelson");
});
afterEach(() => {
  window.location.hash = "";
  vi.unstubAllEnvs();
});

describe("the wired room", () => {
  it("approves exactly the amount of the trade from the wallet and moves on to the commit", async () => {
    const world = funded();
    world.compliant.add(partyKey(SELLER));
    const { user, test } = await enter(world);
    await user.click(await screen.findByRole("button", { name: /approve 25,000,000 USDC/i }));
    const seller = await leg(/Leg A, seller/);
    await waitFor(() => expect(doneCount(seller)).toBe(3));
    expect(world.allowance.get(allowanceKey(USDC, SELLER))).toBe(pkg.terms.sellAmount);
    expect(test.sent).toHaveLength(1);
    expect(
      await within(seller).findByRole("button", { name: /commit to the terms/i }),
    ).toBeInTheDocument();
  });

  it("commits to the hash of the terms the link carries", async () => {
    const world = funded();
    world.compliant.add(partyKey(SELLER));
    world.allowance.set(allowanceKey(USDC, SELLER), pkg.terms.sellAmount);
    const { user } = await enter(world);
    await user.click(await screen.findByRole("button", { name: /commit to the terms/i }));
    await waitFor(() => expect(world.commitments.get(partyKey(SELLER))).toBe(termsHash));
    await waitFor(async () => expect(doneCount(await leg(/Leg A, seller/))).toBe(4));
  });

  it("keeps the step open with a quiet message when the wallet is dismissed", async () => {
    const world = funded();
    world.compliant.add(partyKey(SELLER));
    const { user } = await enter(world, { rejectSend: true });
    await user.click(await screen.findByRole("button", { name: /approve 25,000,000 USDC/i }));
    expect(await screen.findByText(/you dismissed the request/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve 25,000,000 USDC/i })).toBeEnabled();
    expect(world.allowance.size).toBe(0);
  });

  it("settles when both legs are ready and says so once it is done", async () => {
    const world = funded();
    for (const [party, token, amount] of [
      [SELLER, USDC, pkg.terms.sellAmount],
      [BUYER, EURC, pkg.terms.payAmount],
    ] as const) {
      world.compliant.add(partyKey(party));
      world.allowance.set(allowanceKey(token, party), amount);
      world.commitments.set(partyKey(party), termsHash);
    }
    const { user } = await enter(world);
    await user.click(await screen.findByRole("button", { name: /settle both legs/i }));
    await waitFor(() => expect(world.settled).toBe(true));
    expect(await screen.findByText(/settled\. both legs moved/i)).toBeInTheDocument();
  });

  it("re-reads the trade before settling and refuses if the other side moved", async () => {
    const world = funded();
    for (const [party, token, amount] of [
      [SELLER, USDC, pkg.terms.sellAmount],
      [BUYER, EURC, pkg.terms.payAmount],
    ] as const) {
      world.compliant.add(partyKey(party));
      world.allowance.set(allowanceKey(token, party), amount);
      world.commitments.set(partyKey(party), termsHash);
    }
    const { user, test } = await enter(world);
    const button = await screen.findByRole("button", { name: /settle both legs/i });
    world.commitments.set(partyKey(BUYER), `0x${"11".repeat(32)}` as Hex);
    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not ready to settle/i);
    expect(test.sent).toHaveLength(0);
  });

  it("offers the buyer the buyer's steps and not the seller's", async () => {
    const world = funded();
    world.compliant.add(partyKey(BUYER));
    await enter(world, { as: "buyer" });
    expect(
      await screen.findByRole("button", { name: /approve 22,950,000 EURC/i }),
    ).toBeInTheDocument();
    const seller = await leg(/Leg A, seller/);
    expect(within(seller).queryByRole("button", { name: /approve|commit|prove/i })).toBeNull();
  });
});

describe("export for custody", () => {
  const readOnly = async (world: World, hash = `#/trade/${encodePackage(pkg)}`) => {
    window.location.hash = hash;
    const user = userEvent.setup();
    render(
      <App
        load={async () => ({ file: FILE, client: worldClient(world) })}
        makeEngine={fakeEngine()}
      />,
    );
    await user.type(await screen.findByLabelText(/read-only address/i), SELLER);
    await user.click(screen.getByRole("button", { name: /open read-only/i }));
    return user;
  };

  it("exports each step exactly, names it for the allowlist and warns when the trade moves", async () => {
    const world = funded();
    world.compliant.add(partyKey(SELLER));
    const user = await readOnly(world);
    expect(screen.queryByRole("button", { name: /^approve/i })).toBeNull();
    await user.click(await screen.findByRole("button", { name: /export transaction/i }));
    const panel = await screen.findByRole("region", { name: /export: approve the token/i });
    expect(within(panel).getByText("USDC.approve")).toBeInTheDocument();
    expect(within(panel).getByText("5042")).toBeInTheDocument();
    expect(within(panel).getByText(FILE.settlement)).toBeInTheDocument();
    expect(within(panel).getByText(pkg.terms.sellAmount.toString())).toBeInTheDocument();
    expect(within(panel).getByText("20000000000")).toBeInTheDocument();
    expect(within(panel).queryByText(/the trade moved/i)).toBeNull();

    world.allowance.set(allowanceKey(USDC, SELLER), pkg.terms.sellAmount);
    window.dispatchEvent(new Event("focus"));
    expect(
      await within(panel).findByText(/the trade moved since this was prepared/i),
    ).toBeInTheDocument();
  });

  it("exports the settle call when both legs are ready", async () => {
    const world = funded();
    for (const [party, token, amount] of [
      [SELLER, USDC, pkg.terms.sellAmount],
      [BUYER, EURC, pkg.terms.payAmount],
    ] as const) {
      world.compliant.add(partyKey(party));
      world.allowance.set(allowanceKey(token, party), amount);
      world.commitments.set(partyKey(party), termsHash);
    }
    const user = await readOnly(world);
    expect(screen.queryByRole("button", { name: /settle both legs/i })).toBeNull();
    await user.click(await screen.findByRole("button", { name: /export transaction/i }));
    const panel = await screen.findByRole("region", { name: /export: settle both legs/i });
    expect(within(panel).getByText("Settlement.settle")).toBeInTheDocument();
  });
});

const issuer = issuerFromKey(new Uint8Array(32).fill(7));

describe("proving from the room", () => {
  async function withCredential(world: World, engine: ReturnType<typeof fakeEngine>) {
    window.location.hash = "#/credential";
    const test = testWallet({
      key: KEYS.seller,
      onSend: (tx) => applyTransaction(world, tx, { token: USDC, sender: SELLER }),
    });
    const user = userEvent.setup();
    render(
      <App load={async () => ({ file: FILE, client: worldClient(world) })} makeEngine={engine} />,
    );
    await screen.findByRole("heading", { name: /connect a wallet/i });
    act(() => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: test.wallet }));
    });
    await user.click(await screen.findByRole("button", { name: /test wallet/i }));
    await user.type(await screen.findByLabelText("Passphrase"), "a long enough passphrase");
    await user.type(screen.getByLabelText(/repeat the passphrase/i), "a long enough passphrase");
    await user.click(screen.getByRole("button", { name: /create the vault/i }));
    const subject = (await screen.findByText(/^\d{20,}$/)).textContent as string;
    const claims = {
      subject: BigInt(subject),
      credentialId: 4242n,
      tier: 2n,
      jurisdiction: 840n,
      expiry: BigInt(Math.floor(Date.now() / 1000) + 30 * 86_400),
      identifiers: [11n, 22n],
    };
    await user.click(screen.getByLabelText("Credential from your issuer"));
    await user.paste(
      JSON.stringify(
        issuedToJson({
          claims,
          signature: signClaims(issuer, claims),
          issuerKey: { Ax: issuer.Ax, Ay: issuer.Ay },
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: /^import$/i }));
    await screen.findByText("Tier 2");
    act(() => {
      window.location.hash = `#/trade/${encodePackage(pkg)}`;
    });
    return { user, test };
  }

  const proof = {
    calldata: {
      a: [1n, 2n],
      b: [
        [3n, 4n],
        [5n, 6n],
      ],
      c: [7n, 8n],
    },
    signals: Array.from({ length: 13 }, (_, i) => BigInt(i)),
  } as never;
  const pinned = () => {
    vi.stubEnv("VITE_CIRCUIT_WASM_SHA256", "a".repeat(64));
    vi.stubEnv("VITE_CIRCUIT_ZKEY_SHA256", "b".repeat(64));
  };

  it("proves for the connected address and this trade, shows progress and attests", async () => {
    pinned();
    const world = funded();
    const prove = vi.fn(async (_request: unknown, onProgress?: (p: unknown) => void) => {
      onProgress?.({ phase: "download", loaded: 4_000_000, total: 13_000_000 });
      onProgress?.({ phase: "prove" });
      return proof;
    });
    const { user, test } = await withCredential(world, fakeEngine({ prove: prove as never }));
    await user.click(await screen.findByRole("button", { name: /prove and attest/i }));
    await waitFor(() => expect(prove).toHaveBeenCalledOnce());
    const request = prove.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request.tradeId).toBe(pkg.tradeId);
    expect(request.tradingAddress).toBe(BigInt(SELLER));
    expect(request.artifacts).toMatchObject({
      wasmSha256: "a".repeat(64),
      zkeySha256: "b".repeat(64),
    });
    await waitFor(() => expect(world.compliant.has(partyKey(SELLER))).toBe(true));
    expect(test.sent).toHaveLength(1);
    const seller = await leg(/Leg A, seller/);
    await waitFor(() => expect(doneCount(seller)).toBeGreaterThanOrEqual(2));
  }, 40_000);

  it("keeps the proof after a dismissed wallet so it can be sent again without proving twice", async () => {
    pinned();
    const world = funded();
    const prove = vi.fn(async () => proof);
    const wallet = await withCredential(world, fakeEngine({ prove: prove as never }));
    wallet.test.sent.length = 0;
    await wallet.user.click(await screen.findByRole("button", { name: /prove and attest/i }));
    await waitFor(() => expect(world.compliant.has(partyKey(SELLER))).toBe(true));
    expect(prove).toHaveBeenCalledOnce();
  }, 40_000);

  it("explains a build that does not pin the circuit and a list the contract does not accept", async () => {
    const world = funded();
    const { user } = await withCredential(
      world,
      fakeEngine({ prove: (async () => proof) as never }),
    );
    await user.click(await screen.findByRole("button", { name: /prove and attest/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/does not pin the circuit files/i);
  }, 40_000);

  it("tells the holder when the credential cannot be proven for", async () => {
    pinned();
    const world = funded();
    const prove = vi.fn(async () => {
      throw new Error("credential is revoked");
    });
    const { user } = await withCredential(world, fakeEngine({ prove: prove as never }));
    await user.click(await screen.findByRole("button", { name: /prove and attest/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/revoked or on a sanctions list/i);
  }, 40_000);
});

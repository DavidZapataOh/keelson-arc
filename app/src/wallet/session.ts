import { type Address, createWalletClient, custom, getAddress, type WalletClient } from "viem";
import { ARC as arc } from "../chain.ts";
import type { Wallet } from "./types.ts";

export type Snapshot = { address: Address; chainId: number };

export type Session = {
  readonly kind: "wallet" | "readonly";
  readonly name: string;
  readonly snapshot: Snapshot;
  readonly walletClient: WalletClient | undefined;
  onChange(listener: (next: Snapshot) => void): () => void;
  switchChain(): Promise<void>;
  close(): void;
};

export class WrongChainError extends Error {
  constructor() {
    super("the wallet is not on Arc");
    this.name = "WrongChainError";
  }
}

type Provider = Wallet["provider"];

const parseChainId = (value: unknown) => Number(BigInt(value as string));

export async function connect(wallet: Wallet): Promise<Session> {
  const { provider } = wallet;
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const first = accounts[0];
  if (!first) throw new Error("the wallet returned no account");
  const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));

  let snapshot: Snapshot = { address: getAddress(first), chainId };
  let walletClient = clientFor(provider, snapshot.address);
  const listeners = new Set<(next: Snapshot) => void>();
  const publish = (next: Snapshot) => {
    snapshot = next;
    walletClient = clientFor(provider, next.address);
    for (const listener of listeners) listener(next);
  };

  const onAccounts = (value: unknown) => {
    const next = (value as string[])[0];
    if (next) publish({ ...snapshot, address: getAddress(next) });
  };
  const onChain = (value: unknown) => publish({ ...snapshot, chainId: parseChainId(value) });
  provider.on("accountsChanged", onAccounts);
  provider.on("chainChanged", onChain);

  return {
    kind: "wallet",
    name: wallet.info.name,
    get snapshot() {
      return snapshot;
    },
    get walletClient() {
      return walletClient;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async switchChain() {
      await switchToArc(provider);
      publish({
        ...snapshot,
        chainId: parseChainId(await provider.request({ method: "eth_chainId" })),
      });
    },
    close() {
      provider.removeListener("accountsChanged", onAccounts);
      provider.removeListener("chainChanged", onChain);
      listeners.clear();
    },
  };
}

function clientFor(provider: Provider, address: Address): WalletClient {
  return createWalletClient({ account: address, chain: arc, transport: custom(provider) });
}

const ARC_PARAMS = {
  chainId: `0x${arc.id.toString(16)}`,
  chainName: arc.name,
  nativeCurrency: arc.nativeCurrency,
  rpcUrls: [...arc.rpcUrls.default.http],
  blockExplorerUrls: arc.blockExplorers ? [arc.blockExplorers.default.url] : [],
};

async function switchToArc(provider: Provider) {
  const switchChain = () =>
    provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_PARAMS.chainId }],
    });
  try {
    await switchChain();
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [ARC_PARAMS] });
    await switchChain();
  }
}

/** Throws before any transaction is built when the wallet is not on Arc. */
export function assertArc(session: Session): void {
  if (session.snapshot.chainId !== arc.id) throw new WrongChainError();
}

import type { EIP1193Provider } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";
import type { Wallet } from "../../src/wallet/types.ts";

type Listener = (value: unknown) => void;

/** An EIP-1193 provider for tests: one real local account, a switchable chain and emitted events. */
export function testWallet(options: {
  key: `0x${string}`;
  chainId?: number;
  knowsArc?: boolean;
  rejectSend?: boolean;
  onSend?: (tx: { from: string; to: `0x${string}`; data: `0x${string}` }) => void;
}) {
  const account = privateKeyToAccount(options.key);
  const listeners = new Map<string, Set<Listener>>();
  let chainId = options.chainId ?? arc.id;
  let known = options.knowsArc ?? true;
  const requests: { method: string; params?: unknown }[] = [];
  const sent: unknown[] = [];

  const emit = (event: string, value: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(value);
  };

  const provider = {
    async request({ method, params }: { method: string; params?: unknown }) {
      requests.push({ method, params });
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [account.address];
        case "eth_chainId":
          return `0x${chainId.toString(16)}`;
        case "wallet_switchEthereumChain": {
          const target = Number(BigInt((params as { chainId: string }[])[0]?.chainId ?? "0x0"));
          if (target === arc.id && !known)
            throw Object.assign(new Error("unknown chain"), { code: 4902 });
          chainId = target;
          emit("chainChanged", `0x${chainId.toString(16)}`);
          return null;
        }
        case "eth_sendTransaction": {
          if (options.rejectSend)
            throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          const tx = (params as unknown[])[0] as {
            from: string;
            to: `0x${string}`;
            data: `0x${string}`;
          };
          sent.push(tx);
          options.onSend?.(tx);
          return `0x${sent.length.toString(16).padStart(64, "0")}`;
        }
        case "wallet_addEthereumChain":
          known = true;
          return null;
        default:
          throw new Error(`unsupported ${method}`);
      }
    },
    on(event: string, listener: Listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
    },
  } as unknown as EIP1193Provider;

  const wallet: Wallet = {
    info: {
      uuid: `test-${account.address}`,
      name: "Test wallet",
      icon: "data:,",
      rdns: "test.wallet",
    },
    provider,
  };

  return {
    wallet,
    account,
    requests,
    sent,
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
    changeAccount: (address: string) => emit("accountsChanged", [address]),
    changeChain: (id: number) => {
      chainId = id;
      emit("chainChanged", `0x${id.toString(16)}`);
    },
  };
}

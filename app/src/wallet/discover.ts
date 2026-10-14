import type { Wallet } from "./types.ts";

type Announcement = CustomEvent<Wallet>;

/** Wallets announce themselves with EIP-6963; the list updates as announcements arrive. */
export function watchWallets(onChange: (wallets: Wallet[]) => void): () => void {
  const found = new Map<string, Wallet>();
  const listener = (event: Event) => {
    const { detail } = event as Announcement;
    if (!detail?.info?.uuid || !detail.provider) return;
    found.set(detail.info.uuid, detail);
    onChange([...found.values()]);
  };
  window.addEventListener("eip6963:announceProvider", listener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => window.removeEventListener("eip6963:announceProvider", listener);
}

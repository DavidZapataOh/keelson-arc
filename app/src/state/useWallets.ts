import { useEffect, useState } from "react";
import { watchWallets } from "../wallet/discover.ts";
import type { Wallet } from "../wallet/types.ts";

export function useWallets(): Wallet[] {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  useEffect(() => watchWallets(setWallets), []);
  return wallets;
}

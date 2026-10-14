import type { EIP1193Provider } from "viem";

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };

export type Wallet = { info: WalletInfo; provider: EIP1193Provider };

import {
  type Account,
  type Address,
  erc20Abi,
  type Hash,
  type Hex,
  type PublicClient,
  pad,
  parseAbi,
  type WalletClient,
  zeroHash,
} from "viem";
import { submit } from "./tx.ts";

/**
 * CCTP v2 on Arc. Arc is domain 26; the contracts sit at the same addresses on every other
 * supported EVM chain.
 */
export const cctp = {
  arcDomain: 26,
  tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  irisUrl: "https://iris-api.circle.com",
} as const;

/** Standard transfer: the attestation is issued once the source block is final. */
const STANDARD_FINALITY = 2000;

const tokenMessengerAbi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
]);

const messageTransmitterAbi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
]);

type Clients = { publicClient: PublicClient; walletClient: WalletClient | undefined };

/**
 * Burns USDC on the wallet's chain so it can be minted to `recipient` on `destinationDomain`.
 * Returns the burn transaction hash, which identifies the transfer from here on.
 */
export async function burn(
  options: Clients & {
    token: Address;
    amount: bigint;
    destinationDomain: number;
    recipient: Address;
  },
): Promise<Hash> {
  const { publicClient, walletClient, token, amount } = options;
  if (!walletClient?.account) {
    throw new Error("a wallet client with an account is required to send transactions");
  }
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [walletClient.account.address, cctp.tokenMessenger],
  });
  if (allowance < amount) {
    await submit(publicClient, walletClient, (wallet, fees) =>
      wallet.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [cctp.tokenMessenger, amount],
        account: wallet.account as Account,
        chain: wallet.chain,
        ...fees,
      }),
    );
  }
  return submit(publicClient, walletClient, (wallet, fees) =>
    wallet.writeContract({
      address: cctp.tokenMessenger,
      abi: tokenMessengerAbi,
      functionName: "depositForBurn",
      args: [
        amount,
        options.destinationDomain,
        pad(options.recipient, { size: 32 }),
        token,
        zeroHash,
        0n,
        STANDARD_FINALITY,
      ],
      account: wallet.account as Account,
      chain: wallet.chain,
      ...fees,
    }),
  );
}

export type Attested = { message: Hex; attestation: Hex };

/**
 * Waits for Circle to attest a burn. The transfer is identified by the burn hash alone, so a
 * burn whose attestation was never collected can be resumed by calling this again.
 */
export async function attest(options: {
  sourceDomain: number;
  burnHash: Hash;
  irisUrl?: string;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<Attested> {
  const { sourceDomain, burnHash, irisUrl = cctp.irisUrl } = options;
  const { intervalMs = 5_000, timeoutMs = 30 * 60_000 } = options;
  const url = `${irisUrl}/v2/messages/${sourceDomain}?transactionHash=${burnHash}`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await fetch(url);
    if (response.ok) {
      const { messages } = (await response.json()) as {
        messages: { status: string; message: Hex; attestation: Hex }[];
      };
      const done = messages.find((m) => m.status === "complete");
      if (done) return { message: done.message, attestation: done.attestation };
    } else if (response.status !== 404) {
      throw new Error(`attestation service answered ${response.status}`);
    }
    if (Date.now() + intervalMs > deadline) {
      throw new Error(`no attestation for ${burnHash} within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Mints the burned USDC on the wallet's chain. A message can be received only once. */
export function mint(options: Clients & Attested): Promise<Hash> {
  return submit(options.publicClient, options.walletClient, (wallet, fees) =>
    wallet.writeContract({
      address: cctp.messageTransmitter,
      abi: messageTransmitterAbi,
      functionName: "receiveMessage",
      args: [options.message, options.attestation],
      account: wallet.account as Account,
      chain: wallet.chain,
      ...fees,
    }),
  );
}

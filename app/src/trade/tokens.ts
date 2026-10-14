import { eurc, usdc } from "@keelson/sdk/arc";
import { useEffect, useState } from "react";
import { type Address, erc20Abi, isAddressEqual, type PublicClient } from "viem";
import type { Token } from "./terms.ts";

export const KNOWN_TOKENS: Token[] = [
  { address: usdc.address, symbol: "USDC", decimals: usdc.decimals },
  { address: eurc.address, symbol: "EURC", decimals: eurc.decimals },
];

const known = (address: Address) => KNOWN_TOKENS.find((t) => isAddressEqual(t.address, address));

/** Symbol and decimals of any ERC-20, read from the chain; undefined when the address is not a token. */
export async function readToken(
  client: PublicClient,
  address: Address,
): Promise<Token | undefined> {
  const preset = known(address);
  if (preset) return preset;
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return { address, symbol: symbol.slice(0, 12), decimals };
  } catch {
    return undefined;
  }
}

/** Tokens of a trade; an unreadable one is shown by address with raw units and flagged. */
export function useTokens(
  client: PublicClient,
  addresses: Address[],
): Map<string, Token & { verified: boolean }> {
  const [tokens, setTokens] = useState(new Map<string, Token & { verified: boolean }>());
  const key = addresses.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the joined key stands for the addresses
  useEffect(() => {
    let live = true;
    void Promise.all(
      addresses.map(async (address) => {
        const token = await readToken(client, address);
        return [
          address.toLowerCase(),
          token
            ? { ...token, verified: true }
            : {
                address,
                symbol: `${address.slice(0, 6)}…${address.slice(-4)}`,
                decimals: 0,
                verified: false,
              },
        ] as const;
      }),
    ).then((entries) => live && setTokens(new Map(entries)));
    return () => {
      live = false;
    };
  }, [client, key]);
  return tokens;
}

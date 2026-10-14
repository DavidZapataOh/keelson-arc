import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import { hashTerms } from "@keelson/sdk/trade";
import { type Address, erc20Abi, type Hex, type PublicClient, zeroHash } from "viem";
import type { DeploymentFile } from "../deployment/schema.ts";
import type { TradePackage } from "./package.ts";

export type Role = "seller" | "buyer";

export type LegState = {
  compliant: boolean;
  committed: boolean;
  matches: boolean;
  allowance: bigint;
  balance: bigint;
};

export type TradeState = {
  termsHash: Hex;
  legs: Record<Role, LegState>;
  settled: boolean;
  expired: boolean;
  readAt: number;
};

type Chain = { file: DeploymentFile; client: PublicClient };

export async function readTrade(chain: Chain, pkg: TradePackage): Promise<TradeState> {
  const { file, client } = chain;
  const { terms, tradeId } = pkg;
  const termsHash = hashTerms({
    settlement: file.settlement,
    chainId: file.chainId,
    tradeId,
    terms,
    salt: pkg.salt,
  });

  const leg = async (role: Role): Promise<LegState> => {
    const party = terms[role];
    const token = role === "seller" ? terms.sellToken : terms.payToken;
    const [compliant, committed, allowance, balance] = await Promise.all([
      client.readContract({
        address: file.compliance,
        abi: complianceRegistryAbi,
        functionName: "isCompliant",
        args: [tradeId, party],
      }),
      client.readContract({
        address: file.settlement,
        abi: settlementAbi,
        functionName: "commitments",
        args: [tradeId, party],
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [party, file.settlement],
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [party],
      }),
    ]);
    return {
      compliant,
      committed: committed !== zeroHash,
      matches: committed === termsHash,
      allowance,
      balance,
    };
  };

  const [seller, buyer, settled, block] = await Promise.all([
    leg("seller"),
    leg("buyer"),
    client.readContract({
      address: file.settlement,
      abi: settlementAbi,
      functionName: "settled",
      args: [tradeId],
    }),
    client.getBlock(),
  ]);
  const readAt = Number(block.timestamp);
  return {
    termsHash,
    legs: { seller, buyer },
    settled,
    expired: BigInt(readAt) > terms.expiry,
    readAt,
  };
}

const POLL_MS = 4000;

/** Re-reads the trade every few seconds and when the tab regains focus; stops when the returned function is called. */
export function watchTrade(
  chain: Chain,
  pkg: TradePackage,
  onState: (state: TradeState) => void,
  onError: (error: Error) => void,
): () => void {
  let live = true;
  let reading = false;
  const tick = async () => {
    if (!live || reading) return;
    reading = true;
    try {
      const state = await readTrade(chain, pkg);
      if (live) onState(state);
    } catch (error) {
      if (live) onError(error as Error);
    } finally {
      reading = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), POLL_MS);
  const onFocus = () => void tick();
  window.addEventListener("focus", onFocus);
  return () => {
    live = false;
    clearInterval(timer);
    window.removeEventListener("focus", onFocus);
  };
}

export const roleOf = (pkg: TradePackage, address: Address): Role | undefined => {
  if (address.toLowerCase() === pkg.terms.seller.toLowerCase()) return "seller";
  if (address.toLowerCase() === pkg.terms.buyer.toLowerCase()) return "buyer";
  return undefined;
};

import { createPublicClient, erc20Abi, http, parseUnits } from "viem";
import { describe, expect, it } from "vitest";
import { arc, eurc, usdc } from "../../src/arc.ts";

const client = createPublicClient({ chain: arc, transport: http() });

describe("arc mainnet", () => {
  it("reports the configured chain id", async () => {
    expect(await client.getChainId()).toBe(arc.id);
  });

  it.each([
    ["USDC", usdc],
    ["EURC", eurc],
  ])("%s exposes an ERC-20 interface with the configured decimals", async (_, token) => {
    const decimals = await client.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "decimals",
    });
    expect(decimals).toBe(token.decimals);
  });

  it("estimates fees above the 20 gwei floor", async () => {
    const { maxFeePerGas } = await client.estimateFeesPerGas();
    expect(maxFeePerGas).toBeGreaterThanOrEqual(parseUnits("20", 9));
  });
});

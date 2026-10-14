import { settlementAbi } from "@keelson/sdk/abi";
import { arc } from "@keelson/sdk/arc";
import { MIN_FEE_PER_GAS } from "@keelson/sdk/fees";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { describe, expect, it } from "vitest";
import {
  describeCall,
  exportTransaction,
  knownContracts,
  tokenContract,
  transactionJson,
} from "../src/export/transaction.ts";
import { ADDRESSES } from "./support/fakeChain.ts";

const contracts = knownContracts(ADDRESSES);
const TOKEN = "0x3600000000000000000000000000000000000000";
const HASH = `0x${"ab".repeat(32)}` as const;

describe("exported transactions", () => {
  it("carries the chain id, target, calldata and a fee at or above the floor", () => {
    const data = encodeFunctionData({
      abi: settlementAbi,
      functionName: "commit",
      args: [7n, HASH],
    });
    const tx = exportTransaction({ to: ADDRESSES.settlement, data });
    expect(tx).toEqual({
      chainId: arc.id,
      to: ADDRESSES.settlement,
      data,
      value: 0n,
      maxFeePerGas: MIN_FEE_PER_GAS,
    });
    expect(exportTransaction({ to: ADDRESSES.settlement, data }, 1n).maxFeePerGas).toBe(
      MIN_FEE_PER_GAS,
    );
    expect(
      exportTransaction({ to: ADDRESSES.settlement, data }, 50n * 10n ** 9n).maxFeePerGas,
    ).toBe(50n * 10n ** 9n);
  });

  it("describes each trade call so a custody policy can allowlist it", () => {
    const commit = encodeFunctionData({
      abi: settlementAbi,
      functionName: "commit",
      args: [7n, HASH],
    });
    expect(describeCall({ to: ADDRESSES.settlement, data: commit }, { contracts })).toEqual({
      contract: "Settlement",
      function: "commit",
      args: [7n, HASH],
    });

    const approve = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [ADDRESSES.settlement, parseUnits("25000000", 6)],
    });
    const described = describeCall(
      { to: TOKEN, data: approve },
      { contracts: [...contracts, tokenContract("USDC", TOKEN)] },
    );
    expect(described).toEqual({
      contract: "USDC",
      function: "approve",
      args: [ADDRESSES.settlement, 25_000_000_000_000n],
    });
  });

  it("refuses to describe a call to an unknown contract", () => {
    expect(() => describeCall({ to: TOKEN, data: "0x" }, { contracts })).toThrow(/known contract/);
  });

  it("serialises bigint fields as strings in the downloadable file", () => {
    const text = transactionJson(exportTransaction({ to: ADDRESSES.settlement, data: "0x1234" }));
    expect(JSON.parse(text)).toMatchObject({
      chainId: arc.id,
      value: "0",
      maxFeePerGas: "20000000000",
    });
  });
});

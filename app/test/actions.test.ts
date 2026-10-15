import { complianceRegistryAbi, settlementAbi } from "@keelson/sdk/abi";
import { arc } from "@keelson/sdk/arc";
import { MIN_FEE_PER_GAS } from "@keelson/sdk/fees";
import { decodeFunctionData, encodeErrorResult, erc20Abi, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { approveCall, attestCall, commitCall, settleCall } from "../src/actions/calls.ts";
import { explain, SENTENCES } from "../src/actions/errors.ts";
import { sendCall } from "../src/actions/send.ts";
import { describeCall, exportTransaction, knownContracts } from "../src/export/transaction.ts";
import type { Terms } from "../src/trade/terms.ts";
import { readOnly } from "../src/wallet/readonly.ts";
import { connect } from "../src/wallet/session.ts";
import { ADDRESSES } from "./support/fakeChain.ts";
import { sendChain } from "./support/sendChain.ts";
import { testWallet } from "./support/testWallet.ts";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TERMS: Terms = {
  seller: getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8"),
  buyer: getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
  sellToken: getAddress("0x3600000000000000000000000000000000000000"),
  sellAmount: 25_000_000_000_000n,
  payToken: getAddress("0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1"),
  payAmount: 22_950_000_000_000n,
  expiry: 1_800_003_600n,
};
const HASH = `0x${"ab".repeat(32)}` as const;
const SALT = `0x${"cd".repeat(32)}` as const;
const PROOF = {
  calldata: {
    a: [1n, 2n],
    b: [
      [3n, 4n],
      [5n, 6n],
    ],
    c: [7n, 8n],
  },
  signals: Array.from({ length: 13 }, (_, i) => BigInt(i + 100)),
} as never;

describe("the four calls", () => {
  it("builds calldata that decodes back to the exact arguments", () => {
    const attest = decodeFunctionData({
      abi: complianceRegistryAbi,
      data: attestCall(ADDRESSES.compliance, PROOF).data,
    });
    expect(attest.functionName).toBe("attest");
    expect(attest.args?.[3]).toEqual(Array.from({ length: 13 }, (_, i) => BigInt(i + 100)));

    const approve = approveCall(TERMS.sellToken, ADDRESSES.settlement, TERMS.sellAmount);
    expect(decodeFunctionData({ abi: erc20Abi, data: approve.data }).args).toEqual([
      ADDRESSES.settlement,
      TERMS.sellAmount,
    ]);
    expect(approve.to).toBe(TERMS.sellToken);

    expect(
      decodeFunctionData({
        abi: settlementAbi,
        data: commitCall(ADDRESSES.settlement, 7n, HASH).data,
      }).args,
    ).toEqual([7n, HASH]);
    expect(
      decodeFunctionData({
        abi: settlementAbi,
        data: settleCall(ADDRESSES.settlement, 7n, TERMS, SALT).data,
      }).args,
    ).toEqual([7n, TERMS, SALT]);
  });

  it("describes each one for a custody allowlist and exports it with the fee floor", () => {
    const call = commitCall(ADDRESSES.settlement, 7n, HASH);
    expect(describeCall(call, { contracts: knownContracts(ADDRESSES) })).toMatchObject({
      contract: "Settlement",
      function: "commit",
    });
    expect(exportTransaction(call).maxFeePerGas).toBe(MIN_FEE_PER_GAS);
  });
});

describe("explaining failures", () => {
  it("has a sentence for every error the contracts can raise to a user", () => {
    for (const name of [
      "NotCompliant",
      "AlreadySettled",
      "Expired",
      "CommitmentMismatch",
      "SamePartyOnBothSides",
      "NullifierUsed",
      "RootNotAccepted",
      "InvalidProof",
      "TierTooLow",
      "ProofNotCurrent",
      "WrongRegulatorKey",
      "AddressOutOfRange",
    ]) {
      expect(SENTENCES[name], name).toMatch(/\.$/);
    }
  });

  it("recognises a rejected request and anything else", () => {
    expect(explain(Object.assign(new Error("no"), { code: 4001 }))).toEqual({ kind: "rejected" });
    expect(explain(new Error("boom")).kind).toBe("other");
  });
});

describe("sending", () => {
  const call = commitCall(ADDRESSES.settlement, 7n, HASH);

  it("sends from the connected wallet with the fee floor and waits for the receipt", async () => {
    const test = testWallet({ key: KEY });
    const session = await connect(test.wallet);
    const result = await sendCall(sendChain(), session, call);
    expect(result.status).toBe("sent");
    const sent = test.sent[0] as { to: string; data: string; maxFeePerGas: string };
    expect(sent.to.toLowerCase()).toBe(ADDRESSES.settlement.toLowerCase());
    expect(sent.data).toBe(call.data);
    expect(BigInt(sent.maxFeePerGas)).toBeGreaterThanOrEqual(MIN_FEE_PER_GAS);
    session.close();
  });

  it("explains a revert before sending anything", async () => {
    const test = testWallet({ key: KEY });
    const session = await connect(test.wallet);
    const revertData = encodeErrorResult({ abi: settlementAbi, errorName: "NotCompliant" });
    const result = await sendCall(sendChain({ revertData }), session, call);
    expect(result).toEqual({ status: "failed", message: SENTENCES.NotCompliant });
    expect(test.sent).toHaveLength(0);
    session.close();
  });

  it("returns rejected, not an error, when the user dismisses the wallet", async () => {
    const test = testWallet({ key: KEY, rejectSend: true });
    const session = await connect(test.wallet);
    expect(await sendCall(sendChain(), session, call)).toEqual({ status: "rejected" });
    session.close();
  });

  it("reports a transaction that mined but reverted", async () => {
    const test = testWallet({ key: KEY });
    const session = await connect(test.wallet);
    const result = await sendCall(sendChain({ receiptStatus: "0x0" }), session, call);
    expect(result).toMatchObject({ status: "failed", message: expect.stringMatching(/reverted/) });
    session.close();
  });

  it("refuses to send on the wrong chain or from a read-only session", async () => {
    const wrong = testWallet({ key: KEY, chainId: 1 });
    const session = await connect(wrong.wallet);
    expect(await sendCall(sendChain(), session, call)).toMatchObject({
      status: "failed",
      message: expect.stringMatching(/Switch your wallet/),
    });
    expect(wrong.sent).toHaveLength(0);
    session.close();
    const result = await sendCall(sendChain(), readOnly(TERMS.seller), call);
    expect(result).toMatchObject({
      status: "failed",
      message: expect.stringMatching(/read-only/i),
    });
    expect(arc.id).toBeGreaterThan(0);
  });
});

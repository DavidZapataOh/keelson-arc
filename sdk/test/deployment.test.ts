import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readBroadcast } from "../src/deployment.ts";

const real = JSON.parse(
  readFileSync(new URL("./fixtures/broadcast.json", import.meta.url), "utf8"),
);

describe("readBroadcast", () => {
  it("maps a real Foundry broadcast to the six deployed contracts in deployment order", () => {
    const creates = real.transactions.filter(
      (tx: { transactionType: string }) => tx.transactionType === "CREATE",
    );
    const address = (index: number) => creates[index].contractAddress;

    expect(readBroadcast(real)).toEqual({
      chainId: 31337,
      verifier: address(0),
      issuers: address(1),
      sanctions: address(2),
      revocations: address(3),
      compliance: address(4),
      settlement: address(5),
    });
  });

  it("ignores calls and rejects incomplete or ambiguous broadcasts", () => {
    expect(() => readBroadcast({})).toThrow("not a Foundry broadcast");
    expect(() => readBroadcast({ ...real, transactions: real.transactions.slice(0, 3) })).toThrow(
      "RootRegistry",
    );
    const noSettlement = real.transactions.filter(
      (tx: { contractName: string }) => tx.contractName !== "Settlement",
    );
    expect(() => readBroadcast({ ...real, transactions: noSettlement })).toThrow("Settlement");
    expect(() =>
      readBroadcast({ ...real, transactions: [...real.transactions, ...real.transactions] }),
    ).toThrow("exactly");
  });
});

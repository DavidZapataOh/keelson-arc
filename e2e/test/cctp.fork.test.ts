import { burn, cctp, mint, usdc } from "@keelson/sdk";
import {
  erc20Abi,
  type Hex,
  keccak256,
  parseAbi,
  parseEventLogs,
  parseUnits,
  slice,
  toHex,
} from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attestTestMessage, burnMessage, trustTestAttester } from "./support/cctp.ts";
import { type LocalChain, startChain } from "./support/chain.ts";

const BASE_DOMAIN = 6;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const messageSent = parseAbi(["event MessageSent(bytes message)"]);

let chain: LocalChain;

const balance = (account: `0x${string}`) =>
  chain.publicClient.readContract({
    address: usdc.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });

beforeAll(async () => {
  chain = await startChain({ forkUrl: "https://rpc.mainnet.arc.io" });
  await trustTestAttester(chain, cctp.messageTransmitter);
});

afterAll(() => chain?.stop());

const inbound = (recipient: `0x${string}`, amount: bigint, nonce: string) =>
  burnMessage({
    sourceDomain: BASE_DOMAIN,
    destinationDomain: cctp.arcDomain,
    sourceMessenger: cctp.tokenMessenger,
    destinationMessenger: cctp.tokenMessenger,
    burnToken: BASE_USDC,
    recipient,
    amount,
    sender: recipient,
    nonce: keccak256(toHex(nonce)),
  });

describe("cctp v2 on a fork of arc mainnet", () => {
  it("mints USDC burned on another chain, once", async () => {
    const buyer = chain.wallet("buyer");
    const recipient = (buyer.account as { address: `0x${string}` }).address;
    const amount = parseUnits("5", 6);
    const message = inbound(recipient, amount, "inbound");
    const attestation = await attestTestMessage(message);

    const before = await balance(recipient);
    await mint({ publicClient: chain.publicClient, walletClient: buyer, message, attestation });
    const gained = (await balance(recipient)) - before;
    expect(gained).toBeGreaterThan(amount - parseUnits("1", 6));
    expect(gained).toBeLessThanOrEqual(amount);

    await expect(
      mint({ publicClient: chain.publicClient, walletClient: buyer, message, attestation }),
    ).rejects.toThrow("Nonce already used");
  });

  it("rejects a message whose attestation was issued for different content", async () => {
    const buyer = chain.wallet("buyer");
    const recipient = (buyer.account as { address: `0x${string}` }).address;
    const attestation = await attestTestMessage(inbound(recipient, parseUnits("1", 6), "forged"));
    await expect(
      mint({
        publicClient: chain.publicClient,
        walletClient: buyer,
        message: inbound(recipient, parseUnits("900", 6), "forged"),
        attestation,
      }),
    ).rejects.toThrow("Invalid signature");
  });

  it("burns USDC on Arc for another chain with an exact approval", async () => {
    const seller = chain.wallet("seller");
    const owner = (seller.account as { address: `0x${string}` }).address;
    const recipient = "0x00000000000000000000000000000000000000aa";
    const amount = parseUnits("3", 6);

    const before = await balance(owner);
    const hash = await burn({
      publicClient: chain.publicClient,
      walletClient: seller,
      token: usdc.address,
      amount,
      destinationDomain: BASE_DOMAIN,
      recipient,
    });
    expect(before - (await balance(owner))).toBeGreaterThanOrEqual(amount);

    const receipt = await chain.publicClient.getTransactionReceipt({ hash });
    const message = parseEventLogs({ abi: messageSent, logs: receipt.logs })[0]?.args
      .message as Hex;
    expect(Number(slice(message, 4, 8))).toBe(cctp.arcDomain);
    expect(Number(slice(message, 8, 12))).toBe(BASE_DOMAIN);
    expect(Number(slice(message, 140, 144))).toBe(2000);
    expect(BigInt(slice(message, 148 + 68, 148 + 100))).toBe(amount);
    expect(slice(message, 148 + 36 + 12, 148 + 68)).toBe(recipient);
  });
});

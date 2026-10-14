import { resolve } from "node:path";
import { IssuerService, Store } from "@keelson/issuer";
import { buildFromSource, openSnapshot } from "@keelson/lists";
import {
  complianceRegistryAbi,
  type Deployment,
  decryptSubject,
  feeParams,
  type HeldCredential,
  hashTerms,
  holdCredential,
  issuerFromKey,
  issuerLeaf,
  KeelsonClient,
  MerkleTree,
  newSalt,
  newSecret,
  newTradeId,
  openSetSnapshot,
  proveCompliance,
  REVOCATIONS_FORMAT,
  regulatorPublicKey,
  rootRegistryAbi,
  SortedTree,
  subjectOf,
  type Terms,
} from "@keelson/sdk";
import { type Address, encodeFunctionData, parseUnits } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type BuildResult, buildCircuit } from "../../circuits/scripts/build.ts";
import {
  deploySystem,
  deployToken,
  type LocalChain,
  startChain,
  tokenAbi,
} from "./support/chain.ts";

const SAMPLE = resolve(
  new URL("../../lists/test/fixtures/sdn_advanced_sample.xml", import.meta.url).pathname,
);
const CIRCUIT = new URL("../../circuits/main/compliance.circom", import.meta.url).pathname;
const REGULATOR_SECRET = 987654321n;
const SANCTIONED_ADDRESS = "0x252a8bd2319d8a555b872990601221b3a2053bce";

let chain: LocalChain;
let deployment: Deployment;
let circuit: BuildResult;
let issuer: IssuerService;
let sanctionsTree: SortedTree;
let issuersTree: MerkleTree;
let asset: Address;
let cash: Address;

const client = (actor: "owner" | "seller" | "buyer") =>
  new KeelsonClient({
    publicClient: chain.publicClient,
    walletClient: chain.wallet(actor),
    deployment,
  });

async function write(
  actor: "owner" | "seller" | "buyer",
  address: Address,
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[],
) {
  const wallet = chain.wallet(actor);
  const hash = await wallet.sendTransaction({
    account: wallet.account as NonNullable<typeof wallet.account>,
    chain: chain.chain,
    to: address,
    data: encodeFunctionData({ abi, functionName, args } as Parameters<
      typeof encodeFunctionData
    >[0]),
    ...(await feeParams(chain.publicClient)),
  });
  const receipt = await chain.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}

const publishRoot = (registry: Address, root: bigint) =>
  write("owner", registry, rootRegistryAbi, "publish", [root]);

const revocationTree = () => openSetSnapshot(issuer.revocations(), REVOCATIONS_FORMAT);

async function onboard(secret: bigint, entityRef: string, lei: string, wallet: string) {
  const issued = issuer.issue({
    subject: subjectOf(secret),
    tier: 2,
    jurisdiction: 840,
    expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    identifiers: [
      { kind: "id", value: lei },
      { kind: "address", value: wallet },
    ],
    entityRef,
  });
  return holdCredential(secret, issued);
}

async function attest(actor: "seller" | "buyer", held: HeldCredential, tradeId: bigint) {
  const party = chain.wallet(actor).account?.address as Address;
  const keelson = client(actor);
  const context = await keelson.loadContext({
    issuers: issuersTree,
    sanctions: sanctionsTree,
    revocations: revocationTree(),
  });
  const proof = await proveCompliance({
    held,
    tradeId,
    tradingAddress: BigInt(party),
    context,
    keys: { wasm: circuit.wasm, zkey: circuit.zkey },
  });
  await keelson.attest(proof);
}

beforeAll(async () => {
  chain = await startChain();
  const key = regulatorPublicKey(REGULATOR_SECRET);
  deployment = deploySystem(chain, { regulatorKeyX: key.x, regulatorKeyY: key.y });
  circuit = await buildCircuit("compliance", CIRCUIT);

  const { snapshot } = await buildFromSource(SAMPLE, 18);
  sanctionsTree = openSnapshot(snapshot);
  const issuerKey = issuerFromKey(new Uint8Array(32).fill(7));
  issuersTree = new MerkleTree(4, [issuerLeaf(issuerKey)]);
  issuer = new IssuerService(issuerKey, new Store(":memory:"), sanctionsTree);

  await publishRoot(deployment.issuers, issuersTree.root);
  await publishRoot(deployment.sanctions, sanctionsTree.root);
  await publishRoot(deployment.revocations, revocationTree().root);

  asset = (await deployToken(chain, "ASSET")) as Address;
  cash = (await deployToken(chain, "CASH")) as Address;
  await write("owner", asset, tokenAbi, "mint", [
    chain.wallet("seller").account?.address,
    parseUnits("1000", 6),
  ]);
  await write("owner", cash, tokenAbi, "mint", [
    chain.wallet("buyer").account?.address,
    parseUnits("1500", 6),
  ]);
  await write("seller", asset, tokenAbi, "approve", [deployment.settlement, 2n ** 256n - 1n]);
  await write("buyer", cash, tokenAbi, "approve", [deployment.settlement, 2n ** 256n - 1n]);
});

afterAll(() => chain?.stop());

describe("a complete private trade", () => {
  const sellerSecret = newSecret();
  const buyerSecret = newSecret();
  const tradeId = newTradeId();
  const salt = newSalt();
  let seller: HeldCredential;
  let buyer: HeldCredential;

  it("onboards two parties through the issuer, who never sees their secrets", async () => {
    seller = await onboard(
      sellerSecret,
      "kyc-0001 Seller Fund LP",
      "LEI 5493001KJTIIGC8Y1R12",
      "0x1111111111111111111111111111111111111111",
    );
    buyer = await onboard(
      buyerSecret,
      "kyc-0002 Buyer Capital Ltd",
      "LEI 254900HROIFWPRGM1V77",
      "0x2222222222222222222222222222222222222222",
    );
    expect(seller.credential.secret).toBe(sellerSecret);
    expect(seller.credential.credentialId).not.toBe(buyer.credential.credentialId);
  });

  it("records a compliance attestation for each party from a zero-knowledge proof", async () => {
    await attest("seller", seller, tradeId);
    await attest("buyer", buyer, tradeId);

    const sellerAddress = chain.wallet("seller").account?.address as Address;
    const buyerAddress = chain.wallet("buyer").account?.address as Address;
    expect(await client("owner").isCompliant(tradeId, sellerAddress)).toBe(true);
    expect(await client("owner").isCompliant(tradeId, buyerAddress)).toBe(true);
    expect(await client("owner").isCompliant(tradeId + 1n, sellerAddress)).toBe(false);
  });

  it("settles the swap atomically once both sides committed to the same terms", async () => {
    const seller_ = chain.wallet("seller").account?.address as Address;
    const buyer_ = chain.wallet("buyer").account?.address as Address;
    const terms: Terms = {
      seller: seller_,
      buyer: buyer_,
      sellToken: asset,
      sellAmount: parseUnits("1000", 6),
      payToken: cash,
      payAmount: parseUnits("1500", 6),
      expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
    };
    const termsHash = hashTerms({
      settlement: deployment.settlement,
      chainId: deployment.chainId,
      tradeId,
      terms,
      salt,
    });

    await client("seller").commit(tradeId, termsHash);
    await client("buyer").commit(tradeId, termsHash);
    await client("owner").settle(tradeId, terms, salt);

    const balance = (token: Address, who: Address) =>
      chain.publicClient.readContract({
        address: token,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [who],
      }) as Promise<bigint>;
    expect(await balance(asset, buyer_)).toBe(parseUnits("1000", 6));
    expect(await balance(cash, seller_)).toBe(parseUnits("1500", 6));
    expect(await client("owner").isSettled(tradeId)).toBe(true);
  });

  it("lets the regulator open the on-chain record and the issuer name the entity behind it", async () => {
    const events = await chain.publicClient.getContractEvents({
      address: deployment.compliance,
      abi: complianceRegistryAbi,
      eventName: "Attested",
      args: { tradeId },
      fromBlock: 0n,
    });
    expect(events).toHaveLength(2);

    const sellerAddress = chain.wallet("seller").account?.address as Address;
    const record = events.find((e) => e.args.party?.toLowerCase() === sellerAddress.toLowerCase());
    if (!record) throw new Error("no attestation event for the seller");
    const { c1x, c1y, c2 } = record.args as { c1x: bigint; c1y: bigint; c2: bigint };
    const subject = decryptSubject({ c1x, c1y, c2 }, REGULATOR_SECRET);

    expect(subject).toBe(subjectOf(sellerSecret));
    expect(issuer.lookup(subject)[0]?.entityRef).toBe("kyc-0001 Seller Fund LP");
    expect(decryptSubject({ c1x, c1y, c2 }, REGULATOR_SECRET + 1n)).not.toBe(subject);
  });
});

describe("protections", () => {
  it("refuses to issue to a sanctioned entity", () => {
    expect(() =>
      issuer.issue({
        subject: 99n,
        tier: 2,
        jurisdiction: 840,
        expiry: Math.floor(Date.now() / 1000) + 3600,
        identifiers: [
          { kind: "id", value: "LEI 5493001KJTIIGC8Y1R12" },
          { kind: "address", value: SANCTIONED_ADDRESS },
        ],
        entityRef: "sanctioned",
      }),
    ).toThrow("sanctions list");
  });

  it("stops one credential from attesting both sides of a trade", async () => {
    const secret = newSecret();
    const held = await onboard(
      secret,
      "kyc-0003 Wash Trader",
      "LEI 5299000J2N45DDNE4Y28",
      "0x3333333333333333333333333333333333333333",
    );
    const tradeId = newTradeId();
    await attest("seller", held, tradeId);
    await expect(attest("buyer", held, tradeId)).rejects.toThrow();
  });

  it("stops a revoked credential from proving, and rejects stale lists before sending anything", async () => {
    const held = await onboard(
      newSecret(),
      "kyc-0004 Revoked Fund",
      "LEI 213800WAVVOPS85N2205",
      "0x4444444444444444444444444444444444444444",
    );
    const before = revocationTree();

    issuer.revoke(held.credential.credentialId);
    const after = revocationTree();
    await publishRoot(deployment.revocations, after.root);

    const keelson = client("seller");
    const context = await keelson.loadContext({
      issuers: issuersTree,
      sanctions: sanctionsTree,
      revocations: after,
    });
    await expect(
      proveCompliance({
        held,
        tradeId: newTradeId(),
        tradingAddress: BigInt(chain.wallet("seller").account?.address as Address),
        context,
        keys: { wasm: circuit.wasm, zkey: circuit.zkey },
      }),
    ).rejects.toThrow("member");

    // the replaced root is still accepted during the grace period, then it stops being accepted
    await expect(
      keelson.loadContext({ issuers: issuersTree, sanctions: sanctionsTree, revocations: before }),
    ).resolves.toBeDefined();
    await chain.publicClient.request({
      method: "evm_increaseTime" as never,
      params: [2 * 3600] as never,
    });
    await chain.publicClient.request({ method: "evm_mine" as never, params: [] as never });
    await expect(
      keelson.loadContext({ issuers: issuersTree, sanctions: sanctionsTree, revocations: before }),
    ).rejects.toThrow("revocations list is not accepted");
  });

  it("refuses to prove with a sanctions snapshot the contract does not know", async () => {
    const keelson = client("seller");
    const stale = new SortedTree(18, [123456789n]);
    await expect(
      keelson.loadContext({
        issuers: issuersTree,
        sanctions: stale,
        revocations: revocationTree(),
      }),
    ).rejects.toThrow("sanctions list is not accepted");
  });
});

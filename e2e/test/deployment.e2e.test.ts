import { readFileSync } from "node:fs";
import {
  auditDeployment,
  type Check,
  codeHash,
  type Deployment,
  type Expectations,
  feeParams,
  regulatorPublicKey,
  rootRegistryAbi,
} from "@keelson/sdk";
import { type Address, encodeFunctionData, keccak256, parseAbi } from "viem";
import { afterAll, describe, expect, it } from "vitest";
import { accountOf, deploySystem, type LocalChain, startChain } from "./support/chain.ts";
import { createSafe, execFromSafe } from "./support/safe.ts";

const contracts = new URL("../../contracts/", import.meta.url).pathname;
const ownable = parseAbi(["function acceptOwnership()"]);
const verifierArtifact = JSON.parse(
  readFileSync(`${contracts}out/ComplianceVerifier.sol/ComplianceVerifier.json`, "utf8"),
);
const viewKey = regulatorPublicKey(987654321n);

const expectations = (safe: Address, keeper: Address, rootsPublished: boolean): Expectations => ({
  safe,
  keeper,
  policy: { minTier: 1, maxProofAge: 3600n, attestationTtl: 86400n },
  regulatorKey: viewKey,
  listMaxAge: 86400n,
  grace: 3600n,
  verifierCodeHash: codeHash(verifierArtifact.deployedBytecode.object),
  rootsPublished,
});

const failed = (checks: Check[]) => checks.filter((c) => !c.ok).map((c) => c.name);
const acceptOwnership = encodeFunctionData({ abi: ownable, functionName: "acceptOwnership" });

let chain: LocalChain;
afterAll(() => chain?.stop());

async function send(
  actor: "owner" | "keeper",
  to: Address,
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[] = [],
) {
  const wallet = chain.wallet(actor);
  const hash = await wallet.sendTransaction({
    account: wallet.account as NonNullable<typeof wallet.account>,
    chain: chain.chain,
    to,
    data: encodeFunctionData({ abi, functionName, args } as Parameters<
      typeof encodeFunctionData
    >[0]),
    ...(await feeParams(chain.publicClient)),
  });
  const receipt = await chain.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}

const hand = async (
  deployment: Deployment,
  safe: Address,
  signers: ("signer1" | "signer2" | "signer3")[],
  submit: "owner",
) => {
  for (const registry of [deployment.issuers, deployment.compliance]) {
    await execFromSafe(chain, safe, submit, signers, registry, acceptOwnership);
  }
  for (const registry of [deployment.sanctions, deployment.revocations]) {
    await send("keeper", registry, ownable, "acceptOwnership");
  }
};

describe("handing a deployment over, on a fork of Arc mainnet", () => {
  it("moves ownership to a real Safe and to the keeper, and the audit sees exactly that", async () => {
    chain = await startChain({ forkUrl: "https://rpc.mainnet.arc.io" });
    const signers = ["signer1", "signer2", "signer3"] as const;
    const safe = await createSafe(
      chain,
      "owner",
      signers.map((s) => accountOf(s).address),
      2,
    );
    const keeper = accountOf("keeper").address;
    const deployment = deploySystem(chain, {
      regulatorKeyX: viewKey.x,
      regulatorKeyY: viewKey.y,
      safe,
      keeper,
    });

    const before = await auditDeployment(
      chain.publicClient,
      deployment,
      expectations(safe, keeper, false),
    );
    expect(failed(before)).toEqual([
      "issuers is owned by the Safe",
      "issuers has no pending ownership transfer",
      "compliance is owned by the Safe",
      "compliance has no pending ownership transfer",
      "sanctions is owned by the keeper",
      "sanctions has no pending ownership transfer",
      "revocations is owned by the keeper",
      "revocations has no pending ownership transfer",
    ]);

    await hand(deployment, safe, ["signer1", "signer3"], "owner");
    const after = await auditDeployment(
      chain.publicClient,
      deployment,
      expectations(safe, keeper, false),
    );
    expect(failed(after)).toEqual([]);

    const unpublished = await auditDeployment(
      chain.publicClient,
      deployment,
      expectations(safe, keeper, true),
    );
    expect(failed(unpublished)).toEqual([
      "issuers holds a root proofs are accepted against",
      "sanctions holds a root proofs are accepted against",
      "revocations holds a root proofs are accepted against",
    ]);

    await send("keeper", deployment.sanctions, rootRegistryAbi, "publish", [123n]);
    await send("keeper", deployment.revocations, rootRegistryAbi, "publish", [456n]);
    await expect(
      send("keeper", deployment.issuers, rootRegistryAbi, "publish", [789n]),
    ).rejects.toThrow();
    expect(
      failed(
        await auditDeployment(chain.publicClient, deployment, expectations(safe, keeper, true)),
      ),
    ).toEqual(["issuers holds a root proofs are accepted against"]);
  }, 300_000);

  it("fails every check that does not match, and refuses a Safe that lacks a second signature", async () => {
    const signers = ["signer1", "signer2", "signer3"] as const;
    const safe = await createSafe(
      chain,
      "owner",
      signers.map((s) => accountOf(s).address),
      2,
    );
    const keeper = accountOf("keeper").address;
    const deployment = deploySystem(chain, {
      regulatorKeyX: viewKey.x,
      regulatorKeyY: viewKey.y,
      safe,
      keeper,
    });

    await expect(
      execFromSafe(chain, safe, "owner", ["signer1"], deployment.issuers, acceptOwnership),
    ).rejects.toThrow();

    const wrong = {
      ...expectations(safe, keeper, false),
      regulatorKey: { x: 1n, y: 2n },
      listMaxAge: 1n,
      verifierCodeHash: keccak256("0x1234") as `0x${string}`,
    };
    const checks = failed(await auditDeployment(chain.publicClient, deployment, wrong));
    expect(checks).toContain("regulator key is as designed");
    expect(checks).toContain("verifier is the one compiled from this repository");
    expect(checks).toContain("sanctions registry limits are as designed");
  }, 300_000);
});

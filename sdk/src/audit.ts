import { type Address, getAddress, type Hex, isAddress, keccak256, type PublicClient } from "viem";
import { complianceRegistryAbi, rootRegistryAbi, settlementAbi } from "./abi.ts";
import type { Deployment } from "./deployment.ts";
import type { Point } from "./disclosure.ts";

export type Expectations = {
  safe: Address;
  keeper: Address;
  policy: { minTier: number; maxProofAge: bigint; attestationTtl: bigint };
  regulatorKey: Point;
  listMaxAge: bigint;
  grace: bigint;
  /** `codeHash` of the verifier's deployed bytecode as compiled from this repository. */
  verifierCodeHash: Hex;
  /** Require every list registry to hold a current root that proofs are accepted against. */
  rootsPublished: boolean;
};

export type Check = { name: string; ok: boolean; detail: string };

const same = (a: Address, b: Address) => getAddress(a) === getAddress(b);

/**
 * keccak-256 of a contract's executable code without the metadata the compiler appends, whose hash
 * changes with the paths and settings of the build and has no effect on what the code does.
 */
export function codeHash(code: Hex): Hex {
  const bytes = code.slice(2);
  const metadata = Number.parseInt(bytes.slice(-4), 16) * 2 + 4;
  return keccak256(metadata < bytes.length ? (`0x${bytes.slice(0, -metadata)}` as Hex) : code);
}

/** Reads a live deployment and reports, check by check, whether it is the system that was designed. */
export async function auditDeployment(
  client: PublicClient,
  deployment: Deployment,
  expected: Expectations,
): Promise<Check[]> {
  const checks: Check[] = [];
  const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const contracts = Object.entries({
    verifier: deployment.verifier,
    issuers: deployment.issuers,
    sanctions: deployment.sanctions,
    revocations: deployment.revocations,
    compliance: deployment.compliance,
    settlement: deployment.settlement,
  }) as [string, Address][];
  const codes = new Map<string, Hex | undefined>();
  for (const [name, address] of contracts) {
    const code = await client.getCode({ address });
    codes.set(name, code);
    record(`${name} has code`, !!code && code !== "0x", address);
  }

  const verifierCode = codes.get("verifier");
  record(
    "verifier is the one compiled from this repository",
    !!verifierCode && codeHash(verifierCode) === expected.verifierCodeHash,
    verifierCode ? codeHash(verifierCode) : "no code",
  );

  const compliance = (functionName: "verifier" | "issuers" | "sanctions" | "revocations") =>
    client.readContract({
      address: deployment.compliance,
      abi: complianceRegistryAbi,
      functionName,
    });
  for (const name of ["verifier", "issuers", "sanctions", "revocations"] as const) {
    const wired = await compliance(name);
    record(`compliance uses the ${name}`, same(wired, deployment[name]), wired);
  }
  const settlementTarget = await client.readContract({
    address: deployment.settlement,
    abi: settlementAbi,
    functionName: "compliance",
  });
  record(
    "settlement uses the compliance registry",
    same(settlementTarget, deployment.compliance),
    settlementTarget,
  );

  const owners: [string, Address, Address][] = [
    ["issuers", deployment.issuers, expected.safe],
    ["compliance", deployment.compliance, expected.safe],
    ["sanctions", deployment.sanctions, expected.keeper],
    ["revocations", deployment.revocations, expected.keeper],
  ];
  for (const [name, address, owner] of owners) {
    const abi = name === "compliance" ? complianceRegistryAbi : rootRegistryAbi;
    const [current, pending] = await Promise.all([
      client.readContract({ address, abi, functionName: "owner" }),
      client.readContract({ address, abi, functionName: "pendingOwner" }),
    ]);
    record(
      `${name} is owned by ${same(owner, expected.safe) ? "the Safe" : "the keeper"}`,
      same(current, owner),
      current,
    );
    record(
      `${name} has no pending ownership transfer`,
      same(pending, "0x0000000000000000000000000000000000000000"),
      pending,
    );
  }

  const [minTier, maxProofAge, attestationTtl] = await client.readContract({
    address: deployment.compliance,
    abi: complianceRegistryAbi,
    functionName: "policy",
  });
  record(
    "policy is as designed",
    minTier === expected.policy.minTier &&
      maxProofAge === expected.policy.maxProofAge &&
      attestationTtl === expected.policy.attestationTtl,
    `minTier ${minTier}, maxProofAge ${maxProofAge}s, attestationTtl ${attestationTtl}s`,
  );

  const [keyX, keyY] = await Promise.all(
    (["regulatorKeyX", "regulatorKeyY"] as const).map((functionName) =>
      client.readContract({
        address: deployment.compliance,
        abi: complianceRegistryAbi,
        functionName,
      }),
    ),
  );
  record(
    "regulator key is as designed",
    keyX === expected.regulatorKey.x && keyY === expected.regulatorKey.y,
    `${keyX}, ${keyY}`,
  );

  for (const name of ["issuers", "sanctions", "revocations"] as const) {
    const address = deployment[name];
    const read = (functionName: "maxAge" | "grace" | "current") =>
      client.readContract({ address, abi: rootRegistryAbi, functionName });
    const [maxAge, grace, root] = await Promise.all([
      read("maxAge"),
      read("grace"),
      read("current"),
    ]);
    record(
      `${name} registry limits are as designed`,
      maxAge === (name === "issuers" ? 0n : expected.listMaxAge) && grace === expected.grace,
      `maxAge ${maxAge}s, grace ${grace}s`,
    );
    if (expected.rootsPublished) {
      const accepted =
        root === 0n
          ? 0n
          : await client.readContract({
              address,
              abi: rootRegistryAbi,
              functionName: "acceptedVersion",
              args: [root],
            });
      record(`${name} holds a root proofs are accepted against`, accepted !== 0n, `root ${root}`);
    }
  }
  return checks;
}

/** What a deployment file records: the addresses, and the settings and owners they must have. */
export type DeploymentRecord = {
  rpcUrl: string;
  explorerUrl: string;
  startBlock: bigint;
  deployment: Deployment;
  safe: Address;
  keeper: Address;
  policy: Expectations["policy"];
  regulatorKey: Point;
  listMaxAge: bigint;
  grace: bigint;
};

const address = (value: unknown, name: string): Address => {
  if (typeof value !== "string" || !isAddress(value)) throw new Error(`${name} must be an address`);
  return value;
};

const integer = (value: unknown, name: string): bigint => {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new Error(`${name} must be a decimal string`);
  }
  return BigInt(value);
};

const text = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value === "") throw new Error(`${name} is required`);
  return value;
};

const section = (value: unknown): Record<string, unknown> =>
  (value ?? {}) as Record<string, unknown>;

export function parseDeploymentRecord(input: unknown): DeploymentRecord {
  const r = section(input);
  const d = section(r.deployment);
  const policy = section(r.policy);
  const key = section(r.regulatorKey);
  return {
    rpcUrl: text(r.rpcUrl, "rpcUrl"),
    explorerUrl: text(r.explorerUrl, "explorerUrl"),
    startBlock: integer(r.startBlock, "startBlock"),
    deployment: {
      chainId: Number(integer(r.chainId, "chainId")),
      verifier: address(d.verifier, "deployment.verifier"),
      issuers: address(d.issuers, "deployment.issuers"),
      sanctions: address(d.sanctions, "deployment.sanctions"),
      revocations: address(d.revocations, "deployment.revocations"),
      compliance: address(d.compliance, "deployment.compliance"),
      settlement: address(d.settlement, "deployment.settlement"),
    },
    safe: address(r.safe, "safe"),
    keeper: address(r.keeper, "keeper"),
    policy: {
      minTier: Number(integer(policy.minTier, "policy.minTier")),
      maxProofAge: integer(policy.maxProofAge, "policy.maxProofAge"),
      attestationTtl: integer(policy.attestationTtl, "policy.attestationTtl"),
    },
    regulatorKey: { x: integer(key.x, "regulatorKey.x"), y: integer(key.y, "regulatorKey.y") },
    listMaxAge: integer(r.listMaxAge, "listMaxAge"),
    grace: integer(r.grace, "grace"),
  };
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type Credential,
  complianceInput,
  issuerFromKey,
  issuerLeaf,
  MerkleTree,
  regulatorPublicKey,
  SortedTree,
  toCalldata,
} from "@keelson/sdk";
import * as snarkjs from "snarkjs";
import type { BuildResult } from "./build.ts";

const TRADE_ID = 1n;
const VALID_AT = 1_800_000_000n;
const REGULATOR_SECRET = 987654321n;

const issuer = issuerFromKey(new Uint8Array(32).fill(7));
const issuers = new MerkleTree(4, [issuerLeaf(issuer)]);
const sanctions = new SortedTree(18, [111n, 222n, 333n]);
const revocations = new SortedTree(16, [999n]);
const regulatorKey = regulatorPublicKey(REGULATOR_SECRET);

const holder = (secret: bigint, credentialId: bigint, identifiers: bigint[]): Credential => ({
  secret,
  credentialId,
  tier: 2n,
  jurisdiction: 840n,
  expiry: 2_000_000_000n,
  identifiers,
});

const parties = {
  partyA: { credential: holder(1001n, 1n, [1000n, 2000n]), address: 0xa11cen },
  partyB: { credential: holder(2002n, 2n, [3000n, 4000n]), address: 0xb0bn },
  partyAAlias: { credential: holder(1001n, 1n, [1000n, 2000n]), address: 0xa11ce2n },
};

/** Proves the three fixture scenarios with the given build and writes them as JSON for the contract tests. */
export async function writeFixtures(built: BuildResult, out: string): Promise<void> {
  const proofs: Record<string, unknown> = {};
  for (const [name, { credential, address }] of Object.entries(parties)) {
    const input = complianceInput({
      credential,
      issuer,
      issuers,
      issuerIndex: 0,
      sanctions,
      revocations,
      tradeId: TRADE_ID,
      tradingAddress: address,
      minTier: 1n,
      validAt: VALID_AT,
      regulatorKey,
      ephemeral: BigInt(address) * 7919n,
    });
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, built.wasm, built.zkey);
    const { a, b, c } = toCalldata(proof);
    proofs[name] = {
      a: a.map(String),
      b: b.map((pair) => pair.map(String)),
      c: c.map(String),
      signals: publicSignals,
    };
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        tradeId: TRADE_ID.toString(),
        validAt: VALID_AT.toString(),
        roots: {
          issuers: issuers.root.toString(),
          sanctions: sanctions.root.toString(),
          revocations: revocations.root.toString(),
        },
        regulatorKey: { x: regulatorKey.x.toString(), y: regulatorKey.y.toString() },
        proofs,
      },
      null,
      2,
    )}\n`,
  );
}

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import {
  type Credential,
  complianceInput,
  issuerFromKey,
  issuerLeaf,
  MerkleTree,
  regulatorPublicKey,
  SortedTree,
  signCredential,
} from "@keelson/sdk";
import * as snarkjs from "snarkjs";
import { buildCircuit } from "./build.ts";
import { renderReport } from "./report.ts";

const RUNS = 5;

const issuer = issuerFromKey(new Uint8Array(32).fill(7));
const credential: Credential = {
  secret: 12345n,
  credentialId: 42n,
  tier: 2n,
  jurisdiction: 840n,
  expiry: 2_000_000_000n,
  identifiers: [1000n, 2000n],
};

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[values.length >> 1] as number;
const megabytes = (path: string) => statSync(path).size / 1e6;

async function time(run: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await run();
  return performance.now() - start;
}

const built = await buildCircuit(
  "compliance",
  new URL("../main/compliance.circom", import.meta.url).pathname,
);
const vkey = JSON.parse(readFileSync(built.vkey, "utf8"));

const input = complianceInput({
  credential,
  signature: signCredential(issuer, credential),
  issuerKey: issuer,
  issuers: new MerkleTree(4, [issuerLeaf(issuer)]),
  issuerIndex: 0,
  sanctions: new SortedTree(18, [111n, 222n, 333n]),
  revocations: new SortedTree(16, [999n]),
  tradeId: 1n,
  tradingAddress: 0xabcdn,
  minTier: 1n,
  validAt: 1_800_000_000n,
  regulatorKey: regulatorPublicKey(987654321n),
  ephemeral: 555n,
});

const proveTimes: number[] = [];
const verifyTimes: number[] = [];
let publicSignals = 0;
for (let run = 0; run < RUNS; run++) {
  let result: { proof: unknown; publicSignals: string[] } | undefined;
  proveTimes.push(
    await time(async () => {
      result = await snarkjs.groth16.fullProve(input, built.wasm, built.zkey);
    }),
  );
  if (!result) throw new Error("proving failed");
  const { proof, publicSignals: signals } = result;
  publicSignals = signals.length;
  verifyTimes.push(
    await time(async () => {
      if (!(await snarkjs.groth16.verify(vkey, signals, proof))) throw new Error("invalid proof");
    }),
  );
}

writeFileSync(
  new URL("../BENCHMARKS.md", import.meta.url),
  renderReport({
    cpu: cpus()[0]?.model ?? "unknown cpu",
    node: process.version,
    constraints: built.constraints,
    publicSignals,
    ceremonyPower: built.power,
    zkeyMb: megabytes(built.zkey),
    wasmMb: megabytes(built.wasm),
    proveMs: median(proveTimes),
    verifyMs: median(verifyTimes),
  }),
);
process.exit(0);

import { createHash, randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import * as snarkjs from "snarkjs";
import { compileCircuit, strict } from "./build.ts";

const root = new URL("..", import.meta.url).pathname;

export const CEREMONY_DIR = join(root, "ceremony");

export type Contribution = { name: string; contributionHash: string; zkeySha256: string };

export type Transcript = {
  circuit: string;
  constraints: number;
  powersOfTauPower: number;
  r1csSha256: string;
  contributions: Contribution[];
  beacon: { hash: string; iterationsExp: number };
  wasmSha256: string;
  zkeySha256: string;
  verificationKeySha256: string;
};

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const step = (n: number) => String(n).padStart(4, "0");
const list = (work: string) => join(work, "contributions.json");

const readList = (work: string): Contribution[] =>
  existsSync(list(work)) ? JSON.parse(readFileSync(list(work), "utf8")) : [];

const latest = (work: string): { file: string; n: number } => {
  const files = readdirSync(work).filter((f) => /^\d{4}\.zkey$/.test(f));
  const n = Math.max(...files.map((f) => Number.parseInt(f, 10)));
  if (!Number.isFinite(n)) throw new Error("no zkey in the working directory: run start first");
  return { file: join(work, `${step(n)}.zkey`), n };
};

/** Opens a ceremony: compiles the circuit and writes the first, contribution-free key. */
export async function startCeremony(args: { name: string; source: string; work: string }) {
  const compiled = await compileCircuit(args.name, args.source, args.work);
  await snarkjs.zKey.newZKey(compiled.r1cs, compiled.ptau, join(args.work, "0000.zkey"), strict);
  return compiled;
}

/** Adds one contribution on top of the latest key. The entropy never leaves this process. */
export async function contribute(args: { work: string; name: string; entropy?: string }) {
  const { file, n } = latest(args.work);
  const output = join(args.work, `${step(n + 1)}.zkey`);
  const entropy = args.entropy ?? randomBytes(64).toString("hex");
  const contributionHash = await snarkjs.zKey.contribute(file, output, args.name, entropy, strict);
  const record: Contribution = {
    name: args.name,
    contributionHash: String(contributionHash),
    zkeySha256: sha256(output),
  };
  writeFileSync(list(args.work), `${JSON.stringify([...readList(args.work), record], null, 2)}\n`);
  return record;
}

/** Applies the public random beacon, verifies the result and writes the artifacts to publish. */
export async function finalizeCeremony(args: {
  name: string;
  source: string;
  work: string;
  beacon: string;
  iterationsExp: number;
  out?: string;
}) {
  const out = args.out ?? join(CEREMONY_DIR, args.name);
  mkdirSync(out, { recursive: true });
  const compiled = await compileCircuit(args.name, args.source, args.work);
  const contributions = readList(args.work);
  if (contributions.length === 0) throw new Error("a ceremony needs at least one contribution");

  const zkey = join(out, `${args.name}_final.zkey`);
  await snarkjs.zKey.beacon(
    latest(args.work).file,
    zkey,
    "random beacon",
    args.beacon,
    args.iterationsExp,
    strict,
  );
  if (!(await snarkjs.zKey.verifyFromR1cs(compiled.r1cs, compiled.ptau, zkey, strict))) {
    throw new Error("the final key does not match the circuit and the Powers of Tau file");
  }

  const wasm = join(out, `${args.name}.wasm`);
  copyFileSync(compiled.wasm, wasm);
  const vkey = join(out, "verification_key.json");
  const key = await snarkjs.zKey.exportVerificationKey(zkey, strict);
  writeFileSync(vkey, `${JSON.stringify(key, null, 2)}\n`);

  const transcript: Transcript = {
    circuit: args.name,
    constraints: compiled.constraints,
    powersOfTauPower: compiled.power,
    r1csSha256: sha256(compiled.r1cs),
    contributions,
    beacon: { hash: args.beacon, iterationsExp: args.iterationsExp },
    wasmSha256: sha256(wasm),
    zkeySha256: sha256(zkey),
    verificationKeySha256: sha256(vkey),
  };
  writeFileSync(join(out, "transcript.json"), `${JSON.stringify(transcript, null, 2)}\n`);
  return transcript;
}

/**
 * Re-derives everything a published ceremony claims: the circuit is compiled again from source,
 * the key is checked against it and the Powers of Tau file, and every recorded hash must match.
 */
export async function verifyCeremony(args: { name: string; source: string; dir?: string }) {
  const dir = args.dir ?? join(CEREMONY_DIR, args.name);
  const transcript: Transcript = JSON.parse(readFileSync(join(dir, "transcript.json"), "utf8"));
  const zkey = join(dir, `${args.name}_final.zkey`);
  const wasm = join(dir, `${args.name}.wasm`);
  const vkey = join(dir, "verification_key.json");

  const check = (what: string, actual: string, expected: string) => {
    if (actual !== expected) throw new Error(`${what} does not match the transcript`);
  };
  check("the final key", sha256(zkey), transcript.zkeySha256);
  check("the witness generator", sha256(wasm), transcript.wasmSha256);
  check("the verification key", sha256(vkey), transcript.verificationKeySha256);

  const work = join(root, "build", `${args.name}-ceremony-check`);
  const compiled = await compileCircuit(args.name, args.source, work);
  check("the circuit's constraint system", sha256(compiled.r1cs), transcript.r1csSha256);
  check("the witness generator built from source", sha256(compiled.wasm), transcript.wasmSha256);
  if (!(await snarkjs.zKey.verifyFromR1cs(compiled.r1cs, compiled.ptau, zkey, strict))) {
    throw new Error("the final key is not valid for this circuit");
  }
  const exported = await snarkjs.zKey.exportVerificationKey(zkey, strict);
  check(
    "the verification key derived from the final key",
    `${JSON.stringify(exported, null, 2)}\n`,
    readFileSync(vkey, "utf8"),
  );
  return transcript;
}

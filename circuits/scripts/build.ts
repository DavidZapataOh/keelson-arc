import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as snarkjs from "snarkjs";
import { ensurePtau, requiredPower } from "./ptau.ts";

const root = new URL("..", import.meta.url).pathname;

// Public, fixed beacon: keys built here are reproducible and for development only.
const DEV_BEACON = "4b65656c736f6e2d646576";

export const strict = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (message: string) => {
    throw new Error(message);
  },
};

export type BuildResult = {
  dir: string;
  r1cs: string;
  wasm: string;
  zkey: string;
  vkey: string;
  constraints: number;
  power: number;
};

export type Compiled = {
  dir: string;
  r1cs: string;
  wasm: string;
  ptau: string;
  constraints: number;
  power: number;
};

/** Compiles a circuit with `--O2` and fetches the Powers of Tau file its size needs. */
export async function compileCircuit(name: string, source: string, dir: string): Promise<Compiled> {
  mkdirSync(dir, { recursive: true });
  execFileSync(
    "circom",
    [source, "--r1cs", "--wasm", "--sym", "--O2", "-l", join(root, "node_modules"), "-o", dir],
    { stdio: "ignore" },
  );
  const r1cs = join(dir, `${name}.r1cs`);
  const info = await snarkjs.r1cs.info(r1cs, strict);
  const power = requiredPower(info);
  return {
    dir,
    r1cs,
    wasm: join(dir, `${name}_js`, `${name}.wasm`),
    ptau: await ensurePtau(power, join(root, ".cache")),
    constraints: info.nConstraints,
    power,
  };
}

/** Builds a circuit and reproducible development keys for it under `build/<directory>`. */
export async function buildCircuit(
  name: string,
  source: string,
  directory = name,
): Promise<BuildResult> {
  const { dir, r1cs, wasm, ptau, constraints, power } = await compileCircuit(
    name,
    source,
    join(root, "build", directory),
  );

  const draft = join(dir, `${name}_0000.zkey`);
  const zkey = join(dir, `${name}.zkey`);
  await snarkjs.zKey.newZKey(r1cs, ptau, draft, strict);
  await snarkjs.zKey.beacon(draft, zkey, "development", DEV_BEACON, 10, strict);
  if (!(await snarkjs.zKey.verifyFromR1cs(r1cs, ptau, zkey, strict))) {
    throw new Error("zkey does not match the circuit and the ceremony");
  }

  const vkey = join(dir, "verification_key.json");
  const key = await snarkjs.zKey.exportVerificationKey(zkey, strict);
  writeFileSync(vkey, `${JSON.stringify(key, null, 2)}\n`);

  return { dir, r1cs, wasm, zkey, vkey, constraints, power };
}

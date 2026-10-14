import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as snarkjs from "snarkjs";
import { requiredPower } from "./ptau.ts";

const root = new URL("..", import.meta.url).pathname;

const strict = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (message: string) => {
    throw new Error(message);
  },
};

export type CircuitStats = {
  constraints: number;
  publicSignals: number;
  ceremonyPower: number;
};

/** Compiles a circuit with `--O2` and reports the numbers that determine proving cost. */
export async function inspectCircuit(source: string): Promise<CircuitStats> {
  const dir = mkdtempSync(join(tmpdir(), "keelson-circuit-"));
  execFileSync("circom", [source, "--r1cs", "--O2", "-l", join(root, "node_modules"), "-o", dir], {
    stdio: "ignore",
  });
  const name = source
    .split("/")
    .pop()
    ?.replace(/\.circom$/, "");
  const info = await snarkjs.r1cs.info(join(dir, `${name}.r1cs`), strict);
  return {
    constraints: info.nConstraints,
    publicSignals: info.nPubInputs + info.nOutputs,
    ceremonyPower: requiredPower(info),
  };
}

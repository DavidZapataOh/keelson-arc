import { resolve } from "node:path";
import { buildCircuit } from "./build.ts";

const [name, source] = process.argv.slice(2);
if (!name || !source) {
  console.error("usage: node scripts/cli.ts <name> <path/to/circuit.circom>");
  process.exit(1);
}

const result = await buildCircuit(name, resolve(source));
console.log(`${name}: ${result.constraints} constraints, ptau 2^${result.power}`);
console.log(`verification key: ${result.vkey}`);
process.exit(0);

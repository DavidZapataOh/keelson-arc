import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();

export const hash = (inputs: bigint[]): bigint => poseidon.F.toObject(poseidon(inputs));

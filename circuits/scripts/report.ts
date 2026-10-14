export type Measurement = {
  cpu: string;
  node: string;
  constraints: number;
  publicSignals: number;
  ceremonyPower: number;
  zkeyMb: number;
  wasmMb: number;
  proveMs: number;
  verifyMs: number;
};

export const renderReport = (m: Measurement): string =>
  [
    "# Benchmarks",
    "",
    `Measured with snarkjs on ${m.cpu}, Node ${m.node}. Proving time includes witness generation.`,
    "",
    "| Circuit | Constraints | Public signals | Ceremony | Proving key | Witness wasm | Prove | Verify |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    `| Compliance | ${m.constraints.toLocaleString("en-US")} | ${m.publicSignals} | 2^${m.ceremonyPower} | ${m.zkeyMb.toFixed(1)} MB | ${m.wasmMb.toFixed(1)} MB | ${Math.round(m.proveMs)} ms | ${Math.round(m.verifyMs)} ms |`,
    "",
  ].join("\n");

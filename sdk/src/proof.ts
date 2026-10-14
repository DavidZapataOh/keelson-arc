export type Groth16Proof = { pi_a: string[]; pi_b: string[][]; pi_c: string[] };

export type ProofCalldata = {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
};

/** Arranges a snarkjs proof as the arguments of a generated verifier (G2 coordinates swapped). */
export const toCalldata = (proof: Groth16Proof): ProofCalldata => {
  const [ax, ay] = proof.pi_a.map(BigInt) as [bigint, bigint];
  const [[bx0, bx1], [by0, by1]] = proof.pi_b.map((pair) => pair.map(BigInt)) as [
    [bigint, bigint],
    [bigint, bigint],
  ];
  const [cx, cy] = proof.pi_c.map(BigInt) as [bigint, bigint];
  return {
    a: [ax, ay],
    b: [
      [bx1, bx0],
      [by1, by0],
    ],
    c: [cx, cy],
  };
};

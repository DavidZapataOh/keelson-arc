export type VerificationKey = {
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  IC: string[][];
};

const SCALAR_FIELD = "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";
const BASE_FIELD = "0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47";

const word = (value: string) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;

const g1 = (name: string, point: string[]) => [
  `    uint256 private constant ${name}_X = ${word(point[0] as string)};`,
  `    uint256 private constant ${name}_Y = ${word(point[1] as string)};`,
];

// The EVM pairing precompile takes the imaginary coefficient of each G2 coordinate first.
const g2 = (name: string, point: string[][]) => {
  const [x, y] = point as [string[], string[]];
  return [
    `    uint256 private constant ${name}_X1 = ${word(x[1] as string)};`,
    `    uint256 private constant ${name}_X0 = ${word(x[0] as string)};`,
    `    uint256 private constant ${name}_Y1 = ${word(y[1] as string)};`,
    `    uint256 private constant ${name}_Y0 = ${word(y[0] as string)};`,
  ];
};

const g2Words = (name: string) => [`${name}_X1`, `${name}_X0`, `${name}_Y1`, `${name}_Y0`];

/** Renders an MIT-licensed Groth16 verifier whose verification key is baked in as constants. */
export function renderVerifier(contractName: string, key: VerificationKey): string {
  const n = key.nPublic;
  if (key.IC.length !== n + 1) throw new Error("verification key has an unexpected IC length");

  const constants = [
    ...g1("ALPHA", key.vk_alpha_1),
    ...g2("BETA", key.vk_beta_2),
    ...g2("GAMMA", key.vk_gamma_2),
    ...g2("DELTA", key.vk_delta_2),
    ...key.IC.flatMap((point, i) => g1(`IC${i}`, point)),
  ];

  const accumulate = Array.from({ length: n }, (_, i) =>
    [
      `            mstore(add(m, 0x40), IC${i + 1}_X)`,
      `            mstore(add(m, 0x60), IC${i + 1}_Y)`,
      `            mstore(add(m, 0x80), calldataload(add(signals, ${i * 32})))`,
      "            if iszero(staticcall(ECMUL_GAS, 7, add(m, 0x40), 0x60, add(m, 0x40), 0x40)) { revert(0, 0) }",
      "            if iszero(staticcall(ECADD_GAS, 6, m, 0x80, m, 0x40)) { revert(0, 0) }",
    ].join("\n"),
  ).join("\n");

  const pair = (base: number, names: string[]) =>
    names.map((name, i) => `            mstore(add(p, ${base + i * 32}), ${name})`).join("\n");

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev Groth16 verifier for a circuit with ${n} public signals. Generated from its verification key.
contract ${contractName} {
    uint256 private constant SCALAR_FIELD = ${SCALAR_FIELD};
    uint256 private constant BASE_FIELD = ${BASE_FIELD};

    // EIP-1108 prices with headroom, so malformed points cannot burn the caller's whole gas limit.
    uint256 private constant ECADD_GAS = 500;
    uint256 private constant ECMUL_GAS = 7_000;
    uint256 private constant ECPAIRING_GAS = 200_000;

${constants.join("\n")}

    /// @return valid True if the proof is valid for the public signals. Malformed points revert.
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[${n}] calldata signals
    ) external view returns (bool valid) {
        assembly ("memory-safe") {
            for { let i := 0 } lt(i, ${n}) { i := add(i, 1) } {
                if iszero(lt(calldataload(add(signals, shl(5, i))), SCALAR_FIELD)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            let m := mload(0x40)
            mstore(m, IC0_X)
            mstore(add(m, 0x20), IC0_Y)
${accumulate}

            let p := add(m, 0x100)
            let ay := calldataload(add(a, 0x20))
            mstore(p, calldataload(a))
            mstore(add(p, 0x20), mod(sub(BASE_FIELD, mod(ay, BASE_FIELD)), BASE_FIELD))
            calldatacopy(add(p, 0x40), b, 0x80)

${pair(0xc0, ["ALPHA_X", "ALPHA_Y", ...g2Words("BETA")])}

            mstore(add(p, 0x180), mload(m))
            mstore(add(p, 0x1a0), mload(add(m, 0x20)))
${pair(0x1c0, g2Words("GAMMA"))}

            calldatacopy(add(p, 0x240), c, 0x40)
${pair(0x280, g2Words("DELTA"))}

            if iszero(staticcall(ECPAIRING_GAS, 8, p, 0x300, p, 0x20)) { revert(0, 0) }
            valid := mload(p)
        }
    }
}
`;
}

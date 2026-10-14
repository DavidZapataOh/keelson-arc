import { concatHex, createPublicClient, type Hex, http, numberToHex } from "viem";
import { describe, expect, it } from "vitest";
import { arc } from "../../src/arc.ts";

const client = createPublicClient({ chain: arc, transport: http() });

const ECADD = "0x0000000000000000000000000000000000000006";
const ECMUL = "0x0000000000000000000000000000000000000007";
const ECPAIRING = "0x0000000000000000000000000000000000000008";

const word = (value: bigint): Hex => numberToHex(value, { size: 32 });
const words = (...values: bigint[]): Hex => concatHex(values.map(word));

const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
const G1 = [1n, 2n] as const;
const NEG_G1 = [1n, P - 2n] as const;
const G2 = [
  0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2n,
  0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6edn,
  0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975bn,
  0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daan,
] as const;
const TWO_G1 = words(
  0x030644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd3n,
  0x15ed738c0e0a7c92e7845f96b2ae9c0a68a6a449e3538fc7ff3ebf7a5a18a2c4n,
);

const call = async (to: Hex, data: Hex) => (await client.call({ to, data })).data;
const gas = (to: Hex, data: Hex) => client.estimateGas({ to, data });

describe("bn254 precompiles on arc mainnet", () => {
  const pairingOfInverses = words(...G1, ...G2, ...NEG_G1, ...G2);

  it("ecAdd doubles the generator", async () => {
    expect(await call(ECADD, words(...G1, ...G1))).toBe(TWO_G1);
  });

  it("ecMul scales the generator", async () => {
    expect(await call(ECMUL, words(...G1, 2n))).toBe(TWO_G1);
  });

  it("ecPairing accepts a balanced pairing and rejects an unbalanced one", async () => {
    expect(await call(ECPAIRING, pairingOfInverses)).toBe(word(1n));
    expect(await call(ECPAIRING, words(...G1, ...G2))).toBe(word(0n));
  });

  it("charges the EIP-1108 prices", async () => {
    expect(await gas(ECADD, words(...G1, ...G1))).toBeLessThan(30_000n);
    expect(await gas(ECMUL, words(...G1, 2n))).toBeLessThan(35_000n);
    expect(await gas(ECPAIRING, pairingOfInverses)).toBeLessThan(160_000n);
  });
});

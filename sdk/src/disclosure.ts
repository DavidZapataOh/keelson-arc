import { randomBytes } from "node:crypto";
import { buildBabyjub } from "circomlibjs";
import { hash } from "./poseidon.ts";

const babyJub = await buildBabyjub();
const field = babyJub.F;

const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const SCALAR_BITS = 253;

export type Point = { x: bigint; y: bigint };
export type Ciphertext = { c1x: bigint; c1y: bigint; c2: bigint };

export const regulatorPublicKey = (secret: bigint): Point => {
  const [x, y] = babyJub.mulPointEscalar(babyJub.Base8, secret);
  return { x: field.toObject(x), y: field.toObject(y) };
};

/** A fresh 253-bit scalar for one encryption. */
export const randomEphemeral = (): bigint =>
  BigInt(`0x${randomBytes(32).toString("hex")}`) >> BigInt(256 - SCALAR_BITS);

/** Recovers the encrypted subject with the regulator's secret key. */
export const decryptSubject = (ciphertext: Ciphertext, regulatorSecret: bigint): bigint => {
  const shared = babyJub.mulPointEscalar(
    [field.e(ciphertext.c1x), field.e(ciphertext.c1y)],
    regulatorSecret,
  );
  const pad = hash([field.toObject(shared[0]), field.toObject(shared[1])]);
  return (((ciphertext.c2 - pad) % FIELD_MODULUS) + FIELD_MODULUS) % FIELD_MODULUS;
};

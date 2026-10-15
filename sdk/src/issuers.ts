import { type IssuerKey, issuerLeaf } from "./credential.ts";
import { MerkleTree } from "./merkle.ts";
import { ISSUER_DEPTH } from "./parameters.ts";

/** The root `issuers` registry must publish for a set of issuer keys. */
export const issuersRoot = (keys: IssuerKey[]): bigint =>
  new MerkleTree(ISSUER_DEPTH, keys.map(issuerLeaf)).root;

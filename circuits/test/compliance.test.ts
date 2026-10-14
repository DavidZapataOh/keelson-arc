import { complianceInput, decryptSubject, nullifierOf, subjectOf } from "@keelson/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { credential, otherIssuer, regulatorSecret, request } from "./compliance.fixtures.ts";
import { compileFixture } from "./support.ts";

let circuit: Awaited<ReturnType<typeof compileFixture>>;

const run = (input: object) => circuit.calculateWitness(input, true);
const accepts = async (input: object) => circuit.checkConstraints(await run(input));
const valid = () => complianceInput(request);

describe("Compliance", () => {
  beforeAll(async () => {
    circuit = await compileFixture("compliance");
  });

  it("accepts an eligible holder", async () => {
    await accepts(valid());
  });

  it("accepts the last valid second and the exact minimum tier", async () => {
    await accepts({ ...valid(), validAt: credential.expiry - 1n });
    await accepts({ ...valid(), minTier: credential.tier });
  });

  it("rejects an expired credential, including at the expiry second", async () => {
    await expect(run({ ...valid(), validAt: credential.expiry })).rejects.toThrow();
    await expect(run({ ...valid(), validAt: credential.expiry + 1n })).rejects.toThrow();
  });

  it("rejects a tier below the minimum", async () => {
    await expect(run({ ...valid(), minTier: credential.tier + 1n })).rejects.toThrow();
  });

  it("rejects an issuer that is not in the issuers root", async () => {
    const forged = complianceInput({ ...request, issuer: otherIssuer });
    await expect(run(forged)).rejects.toThrow();
  });

  it("rejects fields changed after signing", async () => {
    for (const change of [
      { tier: 3n },
      { jurisdiction: 1n },
      { expiry: credential.expiry + 1n },
      { credentialId: 43n },
      { identifiers: [1000n, 2001n] },
    ]) {
      await expect(run({ ...valid(), ...change })).rejects.toThrow();
    }
  });

  it("rejects a credential used by someone who does not hold its secret", async () => {
    await expect(run({ ...valid(), secret: credential.secret + 1n })).rejects.toThrow();
  });

  it("rejects a forged signature", async () => {
    await expect(run({ ...valid(), sigS: 1n })).rejects.toThrow();
  });

  it("refuses to build inputs for a sanctioned identifier", () => {
    const sanctioned = { ...credential, identifiers: [1000n, 222n] };
    expect(() => complianceInput({ ...request, credential: sanctioned })).toThrow("member");
  });

  it("refuses to build inputs for a revoked credential", () => {
    const revoked = { ...credential, credentialId: 999n };
    expect(() => complianceInput({ ...request, credential: revoked })).toThrow("member");
  });

  it("derives a nullifier that is stable per trade and unique across trades", async () => {
    const nullifier = async (input: object) => (await run(input))[1];
    const base = await nullifier(valid());
    expect(base).toBe(nullifierOf(credential.secret, request.tradeId));
    expect(await nullifier(valid())).toBe(base);
    expect(await nullifier({ ...valid(), tradeId: 2n })).not.toBe(base);
  });

  it("encrypts the subject so only the regulator can recover it", async () => {
    const [, , c1x, c1y, c2] = (await run(valid())) as bigint[];
    const ciphertext = { c1x: c1x as bigint, c1y: c1y as bigint, c2: c2 as bigint };
    expect(decryptSubject(ciphertext, regulatorSecret)).toBe(subjectOf(credential.secret));
    expect(decryptSubject(ciphertext, regulatorSecret + 1n)).not.toBe(subjectOf(credential.secret));
  });

  it("produces unlinkable ciphertexts for the same holder", async () => {
    const first = (await run(valid())) as bigint[];
    const second = (await run(complianceInput({ ...request, ephemeral: 556n }))) as bigint[];
    expect(second[2]).not.toBe(first[2]);
    expect(second[4]).not.toBe(first[4]);
  });

  it("rejects a regulator key that is not on the curve", async () => {
    await expect(run({ ...valid(), regulatorKeyX: 1n, regulatorKeyY: 2n })).rejects.toThrow();
  });
});

import { decryptSubject, regulatorPublicKey } from "@keelson/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { compileFixture } from "./support.ts";

const secret = 987654321n;
const key = regulatorPublicKey(secret);
let circuit: Awaited<ReturnType<typeof compileFixture>>;

const encrypt = async (message: bigint, ephemeral: bigint) => {
  const witness = await circuit.calculateWitness(
    { regulatorKeyX: key.x, regulatorKeyY: key.y, ephemeral, message },
    true,
  );
  await circuit.checkConstraints(witness);
  const [c1x, c1y, c2] = witness.slice(1, 4) as bigint[];
  return { c1x: c1x as bigint, c1y: c1y as bigint, c2: c2 as bigint };
};

describe("Disclosure", () => {
  beforeAll(async () => {
    circuit = await compileFixture("disclosure");
  });

  it("lets the regulator recover the message", async () => {
    for (const message of [0n, 1n, 424242n]) {
      expect(decryptSubject(await encrypt(message, 555n), secret)).toBe(message);
    }
  });

  it("hides the message from any other key", async () => {
    const ciphertext = await encrypt(424242n, 555n);
    expect(decryptSubject(ciphertext, secret + 1n)).not.toBe(424242n);
  });

  it("changes the ciphertext with the ephemeral scalar", async () => {
    const a = await encrypt(424242n, 555n);
    const b = await encrypt(424242n, 556n);
    expect(b.c1x).not.toBe(a.c1x);
    expect(b.c2).not.toBe(a.c2);
  });

  it("rejects a key that is not on the curve", async () => {
    await expect(
      circuit.calculateWitness(
        { regulatorKeyX: 1n, regulatorKeyY: 2n, ephemeral: 5n, message: 1n },
        true,
      ),
    ).rejects.toThrow();
  });

  it("rejects an ephemeral scalar wider than 253 bits", async () => {
    await expect(
      circuit.calculateWitness(
        { regulatorKeyX: key.x, regulatorKeyY: key.y, ephemeral: 1n << 253n, message: 1n },
        true,
      ),
    ).rejects.toThrow();
  });
});

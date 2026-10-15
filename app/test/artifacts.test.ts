import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { ArtifactError, artifactSpec, fetchArtifact, sha256Hex } from "../src/prove/artifacts.ts";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

const bytes = new Uint8Array(200_000).map((_, i) => i % 251);
const serve = (body: Uint8Array, status = 200): typeof fetch =>
  (async () =>
    new Response(body as BodyInit, {
      status,
      headers: { "content-length": String(body.length) },
    })) as unknown as typeof fetch;

const code = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ArtifactError) return error.code;
    throw error;
  }
  return "none";
};

describe("circuit artifacts", () => {
  it("accepts a file whose hash is the pinned one and reports progress up to the full size", async () => {
    const expected = await sha256Hex(bytes);
    const seen: number[] = [];
    const out = await fetchArtifact(
      "https://x.test/c.wasm",
      expected,
      (p) => seen.push(p.loaded),
      serve(bytes),
    );
    expect(out).toEqual(bytes);
    expect(seen.at(-1)).toBe(bytes.length);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("refuses a file with one flipped byte before anything can use it", async () => {
    const expected = await sha256Hex(bytes);
    const flipped = bytes.slice();
    flipped[1234] = (flipped[1234] ?? 0) ^ 1;
    expect(
      await code(() => fetchArtifact("https://x.test/c.zkey", expected, undefined, serve(flipped))),
    ).toBe("hash");
  });

  it("reports a failed download and an unreachable host", async () => {
    const expected = await sha256Hex(bytes);
    expect(
      await code(() =>
        fetchArtifact("https://x.test/c.zkey", expected, undefined, serve(bytes, 404)),
      ),
    ).toBe("download");
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(
      await code(() => fetchArtifact("https://x.test/c.zkey", expected, undefined, down)),
    ).toBe("download");
  });

  it("will not prove from a build that pins nothing or something malformed", () => {
    const good = "a".repeat(64);
    expect(artifactSpec("https://a.test/circuit", { wasm: good, zkey: good }).zkeyUrl).toBe(
      "https://a.test/circuit/compliance.zkey",
    );
    expect(() => artifactSpec("https://a.test/circuit", {})).toThrow(ArtifactError);
    expect(() => artifactSpec("https://a.test/circuit", { wasm: good, zkey: "xyz" })).toThrow(
      ArtifactError,
    );
  });
});

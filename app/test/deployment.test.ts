import { describe, expect, it } from "vitest";
import {
  DeploymentError,
  fetchDeploymentFile,
  loadDeployment,
  verifyDeployment,
} from "../src/deployment/load.ts";
import { parseDeploymentFile } from "../src/deployment/schema.ts";
import { ADDRESSES, FILE, fakeChain } from "./support/fakeChain.ts";

const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof DeploymentError) return error.code;
    throw error;
  }
  return "none";
};

const serve = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("deployment file", () => {
  it("parses a valid file and trims trailing slashes", () => {
    expect(parseDeploymentFile({ ...FILE, listsUrl: "https://lists.example.org//" }).listsUrl).toBe(
      "https://lists.example.org",
    );
  });

  it("rejects unknown fields, bad addresses and insecure urls", () => {
    expect(() => parseDeploymentFile({ ...FILE, extra: 1 })).toThrow(DeploymentError);
    expect(() => parseDeploymentFile({ ...FILE, settlement: "0x12" })).toThrow(DeploymentError);
    expect(() => parseDeploymentFile({ ...FILE, rpcUrl: "http://rpc.example.org" })).toThrow(
      DeploymentError,
    );
    expect(() => parseDeploymentFile({ ...FILE, rpcUrl: "http://localhost:8545" })).not.toThrow();
    expect(() => parseDeploymentFile([])).toThrow(DeploymentError);
  });

  it("reports an unreachable or non-JSON file", async () => {
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await failure(() => fetchDeploymentFile("https://x.test/d.json", down))).toBe(
      "unreachable",
    );
    expect(await failure(() => fetchDeploymentFile("https://x.test/d.json", serve({}, 404)))).toBe(
      "unreachable",
    );
    const text = (async () => new Response("nope")) as unknown as typeof fetch;
    expect(await failure(() => fetchDeploymentFile("https://x.test/d.json", text))).toBe(
      "invalid-file",
    );
  });
});

describe("deployment verification", () => {
  it("accepts a consistent deployment", async () => {
    await expect(verifyDeployment(FILE, fakeChain())).resolves.toBeUndefined();
  });

  it("refuses a file for another chain or an endpoint on another chain", async () => {
    expect(await failure(() => verifyDeployment({ ...FILE, chainId: 1 }, fakeChain()))).toBe(
      "wrong-chain",
    );
    expect(await failure(() => verifyDeployment(FILE, fakeChain({ chainId: 1 })))).toBe(
      "wrong-chain",
    );
  });

  it("refuses an address with no contract", async () => {
    expect(
      await failure(() => verifyDeployment(FILE, fakeChain({ empty: [ADDRESSES.sanctions] }))),
    ).toBe("no-code");
  });

  it("refuses contracts that do not point at each other", async () => {
    const foreign = "0x2000000000000000000000000000000000000009";
    expect(
      await failure(() => verifyDeployment(FILE, fakeChain({ links: { issuers: foreign } }))),
    ).toBe("wrong-link");
    expect(
      await failure(() => verifyDeployment(FILE, fakeChain({ links: { compliance: foreign } }))),
    ).toBe("wrong-link");
  });

  it("loads end to end from a url", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = serve(FILE);
    try {
      const { file } = await loadDeployment("https://x.test/d.json", () => fakeChain());
      expect(file.compliance).toBe(ADDRESSES.compliance);
    } finally {
      globalThis.fetch = original;
    }
  });
});

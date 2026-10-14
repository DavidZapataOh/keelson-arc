import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { PublicClient } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import { attest, burn } from "../src/cctp.ts";

const HASH = `0x${"ab".repeat(32)}` as const;
const MESSAGE = "0x1234";
const ATTESTATION = "0xabcd";

let server: Server;
const serve = async (respond: (call: number, url: string) => [number, unknown]) => {
  const urls: string[] = [];
  server = createServer((request, response) => {
    urls.push(request.url as string);
    const [status, body] = respond(urls.length, request.url as string);
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { irisUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, urls };
};

afterEach(() => server?.close());

describe("attest", () => {
  it("waits through 404 and pending until the attestation is complete", async () => {
    const { irisUrl, urls } = await serve((call) => {
      if (call === 1) return [404, { code: 404, message: "Not found." }];
      if (call === 2) {
        return [
          200,
          {
            messages: [{ status: "pending_confirmations", message: "0x", attestation: "PENDING" }],
          },
        ];
      }
      return [
        200,
        { messages: [{ status: "complete", message: MESSAGE, attestation: ATTESTATION }] },
      ];
    });
    const result = await attest({ sourceDomain: 6, burnHash: HASH, irisUrl, intervalMs: 5 });
    expect(result).toEqual({ message: MESSAGE, attestation: ATTESTATION });
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(`/v2/messages/6?transactionHash=${HASH}`);
  });

  it("gives up with the burn hash after the timeout", async () => {
    const { irisUrl } = await serve(() => [404, { code: 404, message: "Not found." }]);
    await expect(
      attest({ sourceDomain: 6, burnHash: HASH, irisUrl, intervalMs: 5, timeoutMs: 30 }),
    ).rejects.toThrow(`no attestation for ${HASH}`);
  });

  it("fails fast on a service error instead of polling forever", async () => {
    const { irisUrl, urls } = await serve(() => [500, { message: "boom" }]);
    await expect(
      attest({ sourceDomain: 6, burnHash: HASH, irisUrl, intervalMs: 5 }),
    ).rejects.toThrow("attestation service answered 500");
    expect(urls).toHaveLength(1);
  });
});

describe("burn", () => {
  it("requires a wallet with an account before touching the chain", async () => {
    await expect(
      burn({
        publicClient: {} as PublicClient,
        walletClient: undefined,
        token: "0x3600000000000000000000000000000000000000",
        amount: 1n,
        destinationDomain: 6,
        recipient: "0x00000000000000000000000000000000000000aa",
      }),
    ).rejects.toThrow("a wallet client with an account is required");
  });
});

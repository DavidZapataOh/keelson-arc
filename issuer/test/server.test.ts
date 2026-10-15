import type { AddressInfo } from "node:net";
import { holdCredential, issuedFromJson, openSetSnapshot, verifySignature } from "@keelson/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/server.ts";
import {
  holderSecret,
  issuer,
  NOW,
  newService,
  sanctionedAddress,
  validRequest,
} from "./support.ts";

const tokens = { adminToken: "a".repeat(40), regulatorToken: "r".repeat(40) };
const body = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

let base = "";
const { service } = newService();
const server = createApp(service, tokens);

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const call = (path: string, init: RequestInit & { token?: string } = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
  });

describe("public endpoints", () => {
  it("reports health and the issuer key", async () => {
    expect(await (await call("/health")).json()).toEqual({ ok: true });
    expect(await (await call("/issuer")).json()).toEqual({
      Ax: issuer.Ax.toString(),
      Ay: issuer.Ay.toString(),
    });
  });

  it("answers unknown routes with 404", async () => {
    expect((await call("/nope")).status).toBe(404);
  });
});

describe("issuing", () => {
  it("requires the admin token", async () => {
    const payload = body(validRequest({ subject: "7" }));
    expect((await call("/credentials", { method: "POST", body: payload })).status).toBe(401);
    expect(
      (await call("/credentials", { method: "POST", body: payload, token: tokens.regulatorToken }))
        .status,
    ).toBe(401);
  });

  it("issues a credential the holder can verify and hold", async () => {
    const { subjectOf } = await import("@keelson/sdk");
    const response = await call("/credentials", {
      method: "POST",
      token: tokens.adminToken,
      body: body(validRequest({ subject: subjectOf(holderSecret) })),
    });
    expect(response.status).toBe(201);

    const issued = issuedFromJson(await response.json());
    expect(verifySignature(issued.issuerKey, issued.claims, issued.signature)).toBe(true);
    expect(holdCredential(holderSecret, issued).credential.secret).toBe(holderSecret);
  });

  it("rejects malformed and ineligible requests with 400 and a reason", async () => {
    const send = (payload: string) =>
      call("/credentials", { method: "POST", token: tokens.adminToken, body: payload });

    const notJson = await send("{");
    expect(notJson.status).toBe(400);
    expect((await notJson.json()).error).toContain("JSON");

    const badTier = await send(body(validRequest({ subject: "7", tier: 999 })));
    expect(badTier.status).toBe(400);
    expect((await badTier.json()).error).toContain("tier");

    const badSubject = await send(body({ ...validRequest({ subject: "7" }), subject: "abc" }));
    expect((await badSubject.json()).error).toContain("subject");

    const badIdentifier = await send(
      body(validRequest({ subject: "7", identifiers: [{ kind: "name", value: "x" }, 1] })),
    );
    expect((await badIdentifier.json()).error).toContain("identifier");

    const huge = await send(JSON.stringify({ entityRef: "x".repeat(20_000) }));
    expect(huge.status).toBe(400);
  });
});

describe("revocation and lookup", () => {
  it("revokes through the admin API and publishes a snapshot clients can verify", async () => {
    const issued = issuedFromJson(
      await (
        await call("/credentials", {
          method: "POST",
          token: tokens.adminToken,
          body: body(validRequest({ subject: "9" })),
        })
      ).json(),
    );
    const before = await (await call("/revocations")).json();

    expect(
      (await call("/revocations", { method: "POST", body: body({ credentialId: "1" }) })).status,
    ).toBe(401);
    const revoke = await call("/revocations", {
      method: "POST",
      token: tokens.adminToken,
      body: body({ credentialId: issued.claims.credentialId }),
    });
    expect(revoke.status).toBe(200);

    const after = await (await call("/revocations")).json();
    expect(after.root).not.toBe(before.root);
    const tree = openSetSnapshot(after, "keelson.revocations.v1");
    expect(() => tree.prove(issued.claims.credentialId)).toThrow("member");
  });

  it("returns 404 for an unknown credential", async () => {
    const response = await call("/revocations", {
      method: "POST",
      token: tokens.adminToken,
      body: body({ credentialId: "123" }),
    });
    expect(response.status).toBe(404);
  });

  it("lets only the regulator token look a subject up", async () => {
    expect((await call("/subjects/9")).status).toBe(401);
    expect((await call("/subjects/9", { token: tokens.adminToken })).status).toBe(401);
    const response = await call("/subjects/9", { token: tokens.regulatorToken });
    expect(response.status).toBe(200);
    const records = await response.json();
    expect(records[0]).toMatchObject({ entityRef: "kyc-case-0001" });
    expect((await call("/subjects/abc", { token: tokens.regulatorToken })).status).toBe(404);
  });
});

describe("serving browsers", () => {
  const withApp = async (
    options: Record<string, unknown>,
    run: (call: (path: string, init?: RequestInit) => Promise<Response>) => Promise<void>,
  ) => {
    const app = createApp(newService().service, { ...tokens, now: () => NOW * 1000, ...options });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    try {
      await run((path, init) => fetch(`${url}${path}`, init));
    } finally {
      await new Promise((resolve) => app.close(resolve));
    }
  };

  it("sends no CORS headers unless an origin is allowed, and answers preflights when it is", async () => {
    await withApp({}, async (get) => {
      expect((await get("/issuer")).headers.get("access-control-allow-origin")).toBeNull();
    });
    await withApp({ allowedOrigin: "https://app.example.org" }, async (get) => {
      const response = await get("/issuer");
      expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.org");
      const preflight = await get("/demo/credentials", { method: "OPTIONS" });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-headers")).toBe("content-type");
    });
  });

  it("serves only the two published list files from its directory", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "lists-"));
    writeFileSync(join(dir, "sanctions-latest.json"), '{"root":"0x1"}');
    writeFileSync(join(dir, "secret.json"), "{}");
    await withApp({ listsDir: dir }, async (get) => {
      expect(await (await get("/lists/sanctions-latest.json")).json()).toEqual({ root: "0x1" });
      expect((await get("/lists/revocations-latest.json")).status).toBe(404);
      expect((await get("/lists/secret.json")).status).toBe(404);
      expect((await get("/lists/..%2Fetc%2Fpasswd")).status).toBe(404);
    });
    await withApp({}, async (get) => {
      expect((await get("/lists/sanctions-latest.json")).status).toBe(404);
    });
  });

  describe("the testnet demo faucet", () => {
    const demo = (subject: string, address: string) => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, address }),
    });
    const holder = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    it("does not exist unless demo mode is on", async () => {
      await withApp({}, async (get) => {
        expect((await get("/demo/credentials", demo("7", holder))).status).toBe(404);
      });
    });

    it("issues a verifiable credential to anyone, for the address they give", async () => {
      await withApp({ demo: true }, async (get) => {
        const response = await get("/demo/credentials", demo("7", holder));
        expect(response.status).toBe(201);
        const issued = issuedFromJson(await response.json());
        expect(verifySignature(issued.issuerKey, issued.claims, issued.signature)).toBe(true);
        expect(issued.claims.subject).toBe(7n);
        expect(issued.claims.tier).toBe(2n);
      });
    });

    it("refuses a malformed request and a sanctioned address", async () => {
      await withApp({ demo: true }, async (get) => {
        expect((await get("/demo/credentials", demo("abc", holder))).status).toBe(400);
        expect((await get("/demo/credentials", demo("7", "0x12"))).status).toBe(400);
        expect((await get("/demo/credentials", demo("7", sanctionedAddress))).status).toBe(400);
      });
    });

    it("limits how many credentials one client can ask for in an hour", async () => {
      await withApp({ demo: true }, async (get) => {
        const statuses: number[] = [];
        for (let i = 0; i < 12; i++) {
          statuses.push((await get("/demo/credentials", demo(String(i + 1), holder))).status);
        }
        expect(statuses.filter((s) => s === 201)).toHaveLength(10);
        expect(statuses.slice(10)).toEqual([400, 400]);
      });
    });
  });
});

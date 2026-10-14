import type { AddressInfo } from "node:net";
import { holdCredential, issuedFromJson, openSetSnapshot, verifySignature } from "@keelson/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/server.ts";
import { holderSecret, issuer, newService, validRequest } from "./support.ts";

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

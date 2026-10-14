import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Identifier } from "@keelson/lists";
import { issuedToJson } from "@keelson/sdk";
import { type IssueRequest, type IssuerService, RequestError } from "./service.ts";

const MAX_BODY = 16 * 1024;

export type Tokens = { adminToken: string; regulatorToken: string };

const digest = (value: string) => createHash("sha256").update(value).digest();

const authorized = (request: IncomingMessage, token: string): boolean => {
  const header = request.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(digest(presented), digest(token));
};

const send = (response: ServerResponse, status: number, body: unknown, cache = "no-store") => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": cache });
  response.end(JSON.stringify(body));
};

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new RequestError("request body is too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("request body is not valid JSON");
  }
}

const decimal = (value: unknown, name: string): bigint => {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new RequestError(`${name} must be a decimal string`);
  }
  return BigInt(value);
};

const identifier = (value: unknown): Identifier => {
  const item = value as { kind?: unknown; value?: unknown } | null;
  if ((item?.kind !== "id" && item?.kind !== "address") || typeof item.value !== "string") {
    throw new RequestError('each identifier must be { "kind": "id" | "address", "value": string }');
  }
  return { kind: item.kind, value: item.value };
};

export function parseIssueRequest(body: unknown): IssueRequest {
  const input = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(input.identifiers)) throw new RequestError("identifiers must be an array");
  if (typeof input.entityRef !== "string") throw new RequestError("entityRef must be a string");
  return {
    subject: decimal(input.subject, "subject"),
    tier: Number(input.tier),
    jurisdiction: Number(input.jurisdiction),
    expiry: Number(input.expiry),
    identifiers: input.identifiers.map(identifier),
    entityRef: input.entityRef,
  };
}

/** HTTP interface of the issuer. Issuing, revoking and lookups require a bearer token. */
export function createApp(service: IssuerService, tokens: Tokens): Server {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://issuer");
      const route = `${request.method} ${url.pathname}`;

      if (route === "GET /health") return send(response, 200, { ok: true });
      if (route === "GET /issuer") {
        const { Ax, Ay } = service.key;
        return send(
          response,
          200,
          { Ax: Ax.toString(), Ay: Ay.toString() },
          "public, max-age=3600",
        );
      }
      if (route === "GET /revocations") {
        return send(response, 200, service.revocations(), "public, max-age=30");
      }

      if (route === "POST /credentials" || route === "POST /revocations") {
        if (!authorized(request, tokens.adminToken))
          return send(response, 401, { error: "unauthorized" });
        const body = await readJson(request);
        if (route === "POST /credentials") {
          return send(response, 201, issuedToJson(service.issue(parseIssueRequest(body))));
        }
        const credentialId = decimal(
          (body as { credentialId?: unknown })?.credentialId,
          "credentialId",
        );
        return service.revoke(credentialId)
          ? send(response, 200, { revoked: true })
          : send(response, 404, { error: "unknown credential" });
      }

      const lookup = url.pathname.match(/^\/subjects\/([0-9]+)$/);
      if (request.method === "GET" && lookup) {
        if (!authorized(request, tokens.regulatorToken))
          return send(response, 401, { error: "unauthorized" });
        return send(response, 200, service.lookup(BigInt(lookup[1] as string)));
      }

      return send(response, 404, { error: "not found" });
    } catch (error) {
      if (error instanceof RequestError) return send(response, 400, { error: error.message });
      console.error(error);
      return send(response, 500, { error: "internal error" });
    }
  });
}

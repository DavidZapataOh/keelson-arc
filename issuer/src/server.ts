import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Identifier } from "@keelson/lists";
import { issuedToJson } from "@keelson/sdk";
import type { DemoConfig } from "./config.ts";
import { type IssueRequest, type IssuerService, RequestError } from "./service.ts";

const MAX_BODY = 16 * 1024;

export type Tokens = { adminToken: string; regulatorToken: string };

export type Options = Tokens & {
  allowedOrigins?: string[] | undefined;
  listsDir?: string | undefined;
  demo?: DemoConfig | undefined;
  /** Milliseconds since the epoch; tests replace it. */
  now?: (() => number) | undefined;
};

const LIST_FILES = new Set(["sanctions-latest.json", "revocations-latest.json"]);

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

/** Counts events inside a sliding window; used to keep the demo faucet from being drained. */
class Window {
  private readonly times: number[] = [];
  private readonly span: number;

  constructor(span: number) {
    this.span = span;
  }

  count(now: number): number {
    while (this.times.length > 0 && (this.times[0] as number) <= now - this.span)
      this.times.shift();
    return this.times.length;
  }

  add(now: number) {
    this.times.push(now);
  }
}

const clientOf = (request: IncomingMessage): string => {
  const forwarded = request.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || request.socket.remoteAddress || "unknown";
};

/** HTTP interface of the issuer. Issuing, revoking and lookups require a bearer token. */
export function createApp(service: IssuerService, options: Options): Server {
  const tokens = options;
  const perClient = new Map<string, Window>();
  const perDay = new Window(24 * 3600 * 1000);

  const cors = (request: IncomingMessage, response: ServerResponse) => {
    const allowed = options.allowedOrigins ?? [];
    const origin = request.headers.origin;
    const match = allowed.includes("*") ? "*" : allowed.find((item) => item === origin);
    if (!match) return;
    response.setHeader("access-control-allow-origin", match);
    response.setHeader("vary", "origin");
    response.setHeader("access-control-allow-headers", "content-type");
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  };

  const demoCredential = (demo: DemoConfig, request: IncomingMessage, body: unknown) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const address = input.address;
    if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new RequestError("address must be a wallet address");
    }
    const now = (options.now ?? Date.now)();
    const client = perClient.get(clientOf(request)) ?? new Window(3600 * 1000);
    perClient.set(clientOf(request), client);
    if (client.count(now) >= demo.perHour || perDay.count(now) >= demo.perDay) {
      throw new RequestError("too many demo credentials requested, try again later");
    }
    client.add(now);
    perDay.add(now);
    return service.issue({
      subject: decimal(input.subject, "subject"),
      tier: demo.tier,
      jurisdiction: demo.jurisdiction,
      expiry: Math.floor(now / 1000) + demo.validitySeconds,
      identifiers: [
        { kind: "address", value: address },
        { kind: "id", value: `demo ${randomBytes(12).toString("hex")}` },
      ],
      entityRef: `demo ${address.toLowerCase()}`,
    });
  };

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://issuer");
      const route = `${request.method} ${url.pathname}`;
      cors(request, response);

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        return response.end();
      }

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

      const list = url.pathname.match(/^\/lists\/([a-z-]+\.json)$/);
      if (
        request.method === "GET" &&
        list &&
        options.listsDir &&
        LIST_FILES.has(list[1] as string)
      ) {
        try {
          const file = await readFile(join(options.listsDir, list[1] as string), "utf8");
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "public, max-age=60",
          });
          return response.end(file);
        } catch {
          return send(response, 404, { error: "not found" });
        }
      }

      if (route === "POST /demo/credentials" && options.demo) {
        const issued = demoCredential(options.demo, request, await readJson(request));
        return send(response, 201, issuedToJson(issued));
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

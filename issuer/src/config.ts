export type DemoConfig = {
  tier: number;
  jurisdiction: number;
  validitySeconds: number;
  perHour: number;
  perDay: number;
};

export type Config = {
  host: string;
  port: number;
  dbPath: string;
  issuerPrivateKey: Uint8Array;
  adminToken: string;
  regulatorToken: string;
  sanctionsSnapshot: string;
  allowedOrigins: string[];
  listsDir: string | undefined;
  demo: DemoConfig | undefined;
};

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const origins = (value: string | undefined): string[] => {
  const list = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const item of list) {
    if (item !== "*" && !/^https?:\/\/[^/\s]+$/.test(item)) {
      throw new Error(
        "ALLOWED_ORIGIN must be origins such as https://app.example.org, separated by commas",
      );
    }
  }
  return list;
};

const positive = (env: NodeJS.ProcessEnv, name: string): number => {
  const value = Number(required(env, name));
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`);
  return value;
};

const demo = (env: NodeJS.ProcessEnv): DemoConfig | undefined => {
  if (env.DEMO_MODE !== "testnet") return undefined;
  return {
    tier: positive(env, "DEMO_TIER"),
    jurisdiction: positive(env, "DEMO_JURISDICTION"),
    validitySeconds: positive(env, "DEMO_VALIDITY_SECONDS"),
    perHour: positive(env, "DEMO_PER_HOUR"),
    perDay: positive(env, "DEMO_PER_DAY"),
  };
};

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const key = required(env, "ISSUER_PRIVATE_KEY").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error("ISSUER_PRIVATE_KEY must be 32 bytes of hex");

  const adminToken = required(env, "ADMIN_TOKEN");
  const regulatorToken = required(env, "REGULATOR_TOKEN");
  if (adminToken.length < 32 || regulatorToken.length < 32) {
    throw new Error("ADMIN_TOKEN and REGULATOR_TOKEN must be at least 32 characters");
  }
  if (adminToken === regulatorToken) throw new Error("ADMIN_TOKEN and REGULATOR_TOKEN must differ");

  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT is invalid");

  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    dbPath: env.DB_PATH ?? "issuer.db",
    issuerPrivateKey: Uint8Array.from(Buffer.from(key, "hex")),
    adminToken,
    regulatorToken,
    sanctionsSnapshot: required(env, "SANCTIONS_SNAPSHOT"),
    allowedOrigins: origins(env.ALLOWED_ORIGIN),
    listsDir: env.LISTS_DIR || undefined,
    demo: demo(env),
  };
}

export type Config = {
  host: string;
  port: number;
  dbPath: string;
  issuerPrivateKey: Uint8Array;
  adminToken: string;
  regulatorToken: string;
  sanctionsSnapshot: string;
};

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
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
  };
}

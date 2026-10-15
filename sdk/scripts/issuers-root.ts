import { issuersRoot } from "../src/issuers.ts";

const issuerUrl = process.argv[2]?.replace(/\/$/, "");
if (!issuerUrl) {
  console.error("usage: node scripts/issuers-root.ts <issuer url>");
  process.exit(1);
}

const response = await fetch(`${issuerUrl}/issuer`);
if (!response.ok) throw new Error(`the issuer answered ${response.status}`);
const { Ax, Ay } = (await response.json()) as { Ax: string; Ay: string };
const root = issuersRoot([{ Ax: BigInt(Ax), Ay: BigInt(Ay) }]);

console.log(`publish(uint256) argument: ${root}`);
process.exit(0);

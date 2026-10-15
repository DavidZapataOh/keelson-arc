import { resolve } from "node:path";
import { contribute, finalizeCeremony, startCeremony, verifyCeremony } from "./ceremony.ts";
import { COMPLIANCE_SOURCE } from "./keys.ts";

const NAME = "compliance";
const [command, ...args] = process.argv.slice(2);

const usage = `usage:
  node scripts/ceremony-cli.ts start <work-dir>
  node scripts/ceremony-cli.ts contribute <work-dir> <your-name>
  node scripts/ceremony-cli.ts finalize <work-dir> <beacon-hex> [iterations-exponent]
  node scripts/ceremony-cli.ts verify`;

const need = (value: string | undefined): string => {
  if (!value) {
    console.error(usage);
    process.exit(1);
  }
  return value;
};

if (command === "start") {
  const work = resolve(need(args[0]));
  const compiled = await startCeremony({ name: NAME, source: COMPLIANCE_SOURCE, work });
  console.log(`${compiled.constraints} constraints, Powers of Tau 2^${compiled.power}`);
} else if (command === "contribute") {
  const record = await contribute({ work: resolve(need(args[0])), name: need(args[1]) });
  console.log(`contribution hash ${record.contributionHash}`);
  console.log(`zkey sha256 ${record.zkeySha256}`);
} else if (command === "finalize") {
  const transcript = await finalizeCeremony({
    name: NAME,
    source: COMPLIANCE_SOURCE,
    work: resolve(need(args[0])),
    beacon: need(args[1]),
    iterationsExp: Number(args[2] ?? 10),
  });
  console.log(`final key sha256 ${transcript.zkeySha256}`);
} else if (command === "verify") {
  const transcript = await verifyCeremony({ name: NAME, source: COMPLIANCE_SOURCE });
  console.log(
    `valid: ${transcript.contributions.length} contributions, key ${transcript.zkeySha256}`,
  );
} else {
  console.error(usage);
  process.exit(1);
}
process.exit(0);

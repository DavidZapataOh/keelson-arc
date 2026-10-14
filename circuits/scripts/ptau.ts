import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// BLAKE2b-512 of the perpetual Powers of Tau files, as published by snarkjs.
const BLAKE2B: Record<number, string> = {
  8: "d6a8fb3a04feb600096c3b791f936a578c4e664d262e4aa24beed1b7a9a96aa5eb72864d628db247e9293384b74b36ffb52ca8d148d6e1b8b51e279fdf57b583",
  9: "94f108a80e81b5d932d8e8c9e8fd7f46cf32457e31462deeeef37af1b71c2c1b3c71fb0d9b59c654ec266b042735f50311f9fd1d4cadce47ab234ad163157cb5",
  10: "6cfeb8cda92453099d20120bdd0e8a5c4e7706c2da9a8f09ccc157ed2464d921fd0437fb70db42104769efd7d6f3c1f964bcf448c455eab6f6c7d863e88a5849",
  11: "47c282116b892e5ac92ca238578006e31a47e7c7e70f0baa8b687f0a5203e28ea07bbbec765a98dcd654bad618475d4661bfaec3bd9ad2ed12e7abc251d94d33",
  12: "ded2694169b7b08e898f736d5de95af87c3f1a64594013351b1a796dbee393bd825f88f9468c84505ddd11eb0b1465ac9b43b9064aa8ec97f2b73e04758b8a4a",
  13: "58efc8bf2834d04768a3d7ffcd8e1e23d461561729beaac4e3e7a47829a1c9066d5320241e124a1a8e8aa6c75be0ba66f65bc8239a0542ed38e11276f6fdb4d9",
  14: "eeefbcf7c3803b523c94112023c7ff89558f9b8e0cf5d6cdcba3ade60f168af4a181c9c21774b94fbae6c90411995f7d854d02ebd93fb66043dbb06f17a831c1",
  15: "982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e",
  16: "6a6277a2f74e1073601b4f9fed6e1e55226917efb0f0db8a07d98ab01df1ccf43eb0e8c3159432acd4960e2f29fe84a4198501fa54c8dad9e43297453efec125",
  17: "6247a3433948b35fbfae414fa5a9355bfb45f56efa7ab4929e669264a0258976741dfbe3288bfb49828e5df02c2e633df38d2245e30162ae7e3bcca5b8b49345",
  18: "7e6a9c2e5f05179ddfc923f38f917c9e6831d16922a902b0b4758b8e79c2ab8a81bb5f29952e16ee6c5067ed044d7857b5de120a90704c1d3b637fd94b95b13e",
};

export const requiredPower = (info: {
  nConstraints: number;
  nPubInputs: number;
  nOutputs: number;
}): number => Math.ceil(Math.log2(2 * (info.nConstraints + info.nPubInputs + info.nOutputs + 1)));

export async function ensurePtau(power: number, cacheDir: string): Promise<string> {
  const expected = BLAKE2B[power];
  if (!expected) throw new Error(`no pinned Powers of Tau file for power ${power}`);

  const name = `powersOfTau28_hez_final_${String(power).padStart(2, "0")}.ptau`;
  const file = join(cacheDir, name);
  if (!existsSync(file)) {
    mkdirSync(cacheDir, { recursive: true });
    const response = await fetch(`https://circom.info/${name}`);
    if (!response.ok || !response.body) throw new Error(`download failed: ${response.status}`);
    const partial = `${file}.part`;
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial));
    renameSync(partial, file);
  }

  const digest = createHash("blake2b512").update(readFileSync(file)).digest("hex");
  if (digest !== expected) throw new Error(`hash mismatch for ${name}`);
  return file;
}

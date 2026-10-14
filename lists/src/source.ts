import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export const OFAC_ADVANCED_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_ADVANCED.XML";

export type Source = { chunks: AsyncIterable<Uint8Array>; sha256: () => string };

/** Opens a local file or an HTTP(S) URL as a byte stream and hashes the bytes as they are read. */
export async function openSource(location: string): Promise<Source> {
  let stream: AsyncIterable<Uint8Array>;
  if (/^https?:\/\//.test(location)) {
    const response = await fetch(location);
    if (!response.ok || !response.body) throw new Error(`download failed: ${response.status}`);
    stream = Readable.fromWeb(response.body as never);
  } else {
    stream = createReadStream(location);
  }

  const hash = createHash("sha256");
  async function* hashed() {
    for await (const chunk of stream) {
      hash.update(chunk);
      yield chunk;
    }
  }
  return { chunks: hashed(), sha256: () => hash.digest("hex") };
}

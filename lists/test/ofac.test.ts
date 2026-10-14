import { createReadStream } from "node:fs";
import { describe, expect, it } from "vitest";
import { identifierHash } from "../src/identifiers.ts";
import { parseAdvanced } from "../src/ofac.ts";

const sample = new URL("./fixtures/sdn_advanced_sample.xml", import.meta.url).pathname;

async function* split(path: string, size: number) {
  for await (const chunk of createReadStream(path)) {
    for (let i = 0; i < chunk.length; i += size) yield chunk.subarray(i, i + size);
  }
}

describe("parseAdvanced", () => {
  it("collects registry numbers, digital currency addresses and bank or business identifiers", async () => {
    const list = await parseAdvanced(createReadStream(sample));
    expect(list.issued).toBe("2026-10-13");
    expect(list.stats).toEqual({ documents: 6, addresses: 15, features: 1, skipped: 0 });
    expect(list.values).toHaveLength(22);
    expect(list.values).toContain(identifierHash({ kind: "id", value: "040070827" }));
    expect(list.values).toContain(
      identifierHash({ kind: "address", value: "0x252a8bd2319d8a555b872990601221b3a2053bce" }),
    );
    expect(list.values).toContain(identifierHash({ kind: "id", value: "HAVIGB2L" }));
  });

  it("ignores features that are not identifiers", async () => {
    const list = await parseAdvanced(createReadStream(sample));
    expect(list.values).not.toContain(identifierHash({ kind: "id", value: "Naghadeh, Iran" }));
    expect(list.values).not.toContain(
      identifierHash({ kind: "address", value: "skote.vahshat@gmail.com" }),
    );
  });

  it("gives the same result however the bytes are chunked, including splits inside tags and characters", async () => {
    const whole = await parseAdvanced(createReadStream(sample));
    const tiny = await parseAdvanced(split(sample, 7));
    expect(new Set(tiny.values)).toEqual(new Set(whole.values));
    expect(tiny.stats).toEqual(whole.stats);
  });

  it("rejects malformed XML", async () => {
    async function* broken() {
      yield new TextEncoder().encode("<Sanctions><Feature>");
    }
    await expect(parseAdvanced(broken())).rejects.toThrow();
  });
});

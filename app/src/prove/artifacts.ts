export type ArtifactSpec = {
  wasmUrl: string;
  zkeyUrl: string;
  wasmSha256: string;
  zkeySha256: string;
};

export type DownloadProgress = { loaded: number; total: number };

export type ArtifactFailure = "unconfigured" | "download" | "hash";

export class ArtifactError extends Error {
  readonly code: ArtifactFailure;

  constructor(code: ArtifactFailure, message: string) {
    super(message);
    this.name = "ArtifactError";
    this.code = code;
  }
}

const HEX = /^[0-9a-f]{64}$/;

/** The circuit files of this build: their location comes from the deployment, their hashes from the build. */
export function artifactSpec(
  assetsUrl: string,
  hashes: { wasm?: string; zkey?: string },
): ArtifactSpec {
  if (!hashes.wasm || !hashes.zkey || !HEX.test(hashes.wasm) || !HEX.test(hashes.zkey)) {
    throw new ArtifactError(
      "unconfigured",
      "This build of the app does not pin the circuit files, so it will not prove.",
    );
  }
  return {
    wasmUrl: `${assetsUrl}/compliance.wasm`,
    zkeyUrl: `${assetsUrl}/compliance.zkey`,
    wasmSha256: hashes.wasm,
    zkeySha256: hashes.zkey,
  };
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Downloads a file and refuses it unless its SHA-256 is the pinned one. */
export async function fetchArtifact(
  url: string,
  expected: string,
  onProgress: (progress: DownloadProgress) => void = () => undefined,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response;
  try {
    response = await fetcher(url);
  } catch {
    throw new ArtifactError("download", "The circuit files could not be downloaded.");
  }
  if (!response.ok || !response.body) {
    throw new ArtifactError("download", "The circuit files could not be downloaded.");
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ loaded, total: Math.max(total, loaded) });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if ((await sha256Hex(bytes)) !== expected) {
    throw new ArtifactError(
      "hash",
      "A circuit file does not match the one this app was built with. It was not used.",
    );
  }
  return bytes;
}

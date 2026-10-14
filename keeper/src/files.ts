import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Writes through a temporary file so a reader never sees a half-written snapshot or state file. */
export function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, contents);
  renameSync(temporary, path);
}

export function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;
}

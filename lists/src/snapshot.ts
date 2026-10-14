import {
  buildSetSnapshot,
  openSetSnapshot,
  SANCTIONS_FORMAT,
  type SetSnapshot,
  serializeSetSnapshot,
} from "@keelson/sdk";

export type SanctionsSource = { name: string; issued: string; sha256: string };
export type SanctionsSnapshot = SetSnapshot<SanctionsSource>;

export const buildSnapshot = (values: bigint[], depth: number, source: SanctionsSource) =>
  buildSetSnapshot(SANCTIONS_FORMAT, values, depth, source);

export const openSnapshot = (snapshot: SanctionsSnapshot) =>
  openSetSnapshot(snapshot, SANCTIONS_FORMAT);

export const serializeSnapshot = (snapshot: SanctionsSnapshot): string =>
  serializeSetSnapshot(snapshot);

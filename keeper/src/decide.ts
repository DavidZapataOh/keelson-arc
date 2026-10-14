export type RegistryState = {
  current: bigint;
  updatedAt: bigint;
  maxAge: bigint;
};

export type Action = "publish" | "refresh" | "unchanged";

/**
 * What the keeper should do so a registry keeps accepting proofs against `root`:
 * publish a new root, refresh the unchanged one before it goes stale, or nothing.
 * A root is refreshed once a quarter of its allowed age has passed, so several missed ticks fit in the window.
 */
export function decide(state: RegistryState, root: bigint, now: bigint): Action {
  if (state.current !== root) return "publish";
  if (state.maxAge === 0n) return "unchanged";
  return now - state.updatedAt >= state.maxAge / 4n ? "refresh" : "unchanged";
}

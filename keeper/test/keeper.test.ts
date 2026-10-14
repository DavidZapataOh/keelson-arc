import { describe, expect, it } from "vitest";
import { Keeper } from "../src/keeper.ts";

describe("Keeper", () => {
  it("runs every job and reports failures without stopping the others", async () => {
    const log: Record<string, unknown>[] = [];
    const keeper = new Keeper(
      [
        { name: "a", run: async () => ({ done: 1 }) },
        {
          name: "b",
          run: async () => {
            throw new Error("boom");
          },
        },
        { name: "c", run: async () => "ok" },
      ],
      (entry) => log.push(entry),
    );

    expect(await keeper.tick()).toEqual([
      { job: "a", ok: true, result: { done: 1 } },
      { job: "b", ok: false, error: "boom" },
      { job: "c", ok: true, result: "ok" },
    ]);
    expect(log).toHaveLength(3);
  });

  it("ticks repeatedly and stops promptly when aborted", async () => {
    let ticks = 0;
    const keeper = new Keeper([{ name: "n", run: async () => ticks++ }], () => {});
    const controller = new AbortController();
    const running = keeper.run(20, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 120));
    controller.abort();
    await running;
    expect(ticks).toBeGreaterThanOrEqual(2);

    const stopped = ticks;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(ticks).toBe(stopped);
  });

  it("does not tick at all if it is already aborted", async () => {
    let ticks = 0;
    const controller = new AbortController();
    controller.abort();
    await new Keeper([{ name: "n", run: async () => ticks++ }], () => {}).run(
      10,
      controller.signal,
    );
    expect(ticks).toBe(0);
  });
});

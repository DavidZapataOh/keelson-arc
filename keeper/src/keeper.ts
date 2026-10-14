export type Job = { name: string; run: () => Promise<unknown> };

export type Report =
  | { job: string; ok: true; result: unknown }
  | { job: string; ok: false; error: string };

export type Logger = (entry: Record<string, unknown>) => void;

/** Runs the maintenance jobs on a timer. One failing job never stops the others or the loop. */
export class Keeper {
  private readonly jobs: Job[];
  private readonly log: Logger;

  constructor(jobs: Job[], log: Logger = (entry) => console.log(JSON.stringify(entry))) {
    this.jobs = jobs;
    this.log = log;
  }

  async tick(): Promise<Report[]> {
    const reports: Report[] = [];
    for (const job of this.jobs) {
      try {
        const result = await job.run();
        reports.push({ job: job.name, ok: true, result });
        this.log({ job: job.name, ok: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reports.push({ job: job.name, ok: false, error: message });
        this.log({ job: job.name, ok: false, error: message });
      }
    }
    return reports;
  }

  async run(intervalMs: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.tick();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, intervalMs);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }
}

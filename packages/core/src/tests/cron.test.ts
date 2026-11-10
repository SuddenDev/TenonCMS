import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobsOptions } from "../jobs/index.ts";
import { defineTask } from "../index.ts";
import { boom, calls, greet, jobsCms, onFile, resetJobs } from "./jobs-setup.ts";
import { origin, setup, withAdmin } from "./setup.ts";

const DAY = 24 * 3_600_000;
const editor = { name: "Ed", email: "e@b.co", password: "password123" };

afterEach(resetJobs);

describe("cron", () => {
  const M = 60_000;
  const START = Math.ceil(Date.now() / M) * M;
  const EVERY_MINUTE = "* * * * *";

  const tick = defineTask({
    run: async ({ job }) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      calls.push({ payload: "tick", id: job.id });
    },
  });
  const schedule = { tasks: { tick }, scheduledTasks: { [EVERY_MINUTE]: ["tick"] } };
  const CRON_ROWS = `SELECT cron, task, status, attempts, max_attempts, run_at FROM cms_jobs WHERE cron IS NOT NULL ORDER BY run_at`;

  /** Fake time at the start of a minute, with a migrated instance that has the cron entry. */
  async function started(jobs: JobsOptions = schedule) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
    const f = await onFile(jobs);
    return { ...f, cron: () => f.exec(CRON_ROWS) };
  }
  const at = (ms: number) => vi.setSystemTime(START + ms);

  it("seeds the next slot with one attempt and runs it once it is due", async () => {
    const { cms, cron } = await started();
    expect(await cron()).toEqual([
      {
        cron: EVERY_MINUTE,
        task: "tick",
        status: "queued",
        attempts: 0,
        max_attempts: 1,
        run_at: START + M,
      },
    ]);
    expect(await cms.jobs.run()).toEqual({ ran: 0, next: START + M });

    at(M);
    expect(await cms.jobs.run()).toEqual({ ran: 1, next: START + 2 * M });
    expect(calls).toHaveLength(1);
    expect(await cron()).toMatchObject([
      { status: "done", run_at: START + M },
      { status: "queued", run_at: START + 2 * M },
    ]);
  });

  it("does not seed a slot again after it ran", async () => {
    const { cms, cron } = await started();
    at(M);
    await cms.jobs.run();
    const rows = await cron();
    await cms.jobs.run();
    await cms.jobs.run();
    expect(await cron()).toEqual(rows);
    expect(calls).toHaveLength(1);
  });

  it("runs a slot once for two run() calls on one instance", async () => {
    const { cms } = await started();
    at(M);
    const [a, b] = await Promise.all([cms.jobs.run(), cms.jobs.run()]);
    expect(a.ran + b.ran).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("runs a slot once for two instances on one database", async () => {
    const { database, cron } = await started();
    const other = jobsCms(schedule, database);
    const first = jobsCms(schedule, database);
    await first.jobs.run();
    await other.jobs.run();
    at(M);
    const [a, b] = await Promise.all([first.jobs.run(), other.jobs.run()]);
    expect(a.ran + b.ran).toBe(1);
    expect(calls).toHaveLength(1);
    expect(await cron()).toHaveLength(2);
  });

  it("runs a missed slot once and skips the slots after it", async () => {
    const { cms, cron } = await started();
    at(10 * M + 5_000);
    expect((await cms.jobs.run()).ran).toBe(1);
    expect(calls).toHaveLength(1);
    expect(await cron()).toMatchObject([
      { status: "done", run_at: START + M },
      { status: "queued", run_at: START + 11 * M },
    ]);
    expect((await cms.jobs.run()).ran).toBe(0);
  });

  it("keeps only the last run of an entry", async () => {
    const { cms, cron } = await started();
    for (const n of [1, 2, 3]) {
      at(n * M);
      await cms.jobs.run();
    }
    expect(await cron()).toMatchObject([
      { status: "done", run_at: START + 3 * M },
      { status: "queued", run_at: START + 4 * M },
    ]);
  });

  it("does not retry a failed slot, and the next slot replaces it", async () => {
    const { cms, cron } = await started({
      tasks: { boom },
      scheduledTasks: { [EVERY_MINUTE]: ["boom"] },
    });
    at(M);
    await cms.jobs.run();
    expect(await cron()).toMatchObject([
      { status: "failed", attempts: 1, run_at: START + M },
      { status: "queued", run_at: START + 2 * M },
    ]);
    at(2 * M);
    await cms.jobs.run();
    expect(await cron()).toMatchObject([
      { status: "failed", run_at: START + 2 * M },
      { status: "queued", run_at: START + 3 * M },
    ]);
  });

  it("keeps the last run of a rare entry past the 30 day retention", async () => {
    const { cms, exec, cron } = await started();
    await exec(
      `INSERT INTO cms_jobs (id, task, payload, status, run_at, attempts, max_attempts, cron, created_at, updated_at) VALUES ('old', 'tick', 'null', 'done', ?, 1, 1, ?, ?, ?)`,
      [START - M, EVERY_MINUTE, START - M, START - M],
    );
    at(40 * DAY);
    await cms.jobs.run();
    expect((await cron()).map((r) => r.status)).toContain("done");
  });

  it("deletes the rows of an entry that is no longer configured", async () => {
    const { cms, database, exec, cron } = await started();
    await cms.jobs.queue("greet");
    at(M);
    await cms.jobs.run();
    expect(await cron()).toHaveLength(2);

    await jobsCms({ tasks: { tick } }, database).jobs.run();
    expect(await cron()).toEqual([]);
    expect(await exec(`SELECT task FROM cms_jobs`)).toMatchObject([{ task: "greet" }]);
  });

  describe("GET /jobs/cron", () => {
    const open = defineTask({ access: ["editor"], run: () => {} });
    const list = async (s: { fetch: typeof fetch }) =>
      (await (await s.fetch(`${origin}/_tenon/jobs/cron`)).json()) as Array<{
        pattern: string;
        task: string;
        next: string | null;
        last: { status: string } | null;
      }>;

    it("lists pattern, task, next run and last run of the entries a user may see", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(START);
      const cms = jobsCms({
        tasks: { tick, open },
        scheduledTasks: { [EVERY_MINUTE]: ["tick", "open"] },
      });
      const a = await withAdmin(cms);
      await a.create(editor);
      const b = setup(cms);
      await b.client.signIn(editor);

      await cms.jobs.run();
      expect(await list(a)).toEqual([
        {
          pattern: EVERY_MINUTE,
          task: "tick",
          next: new Date(START + M).toISOString(),
          last: null,
        },
      ]);

      at(M);
      await cms.jobs.run();
      const [entry] = await list(a);
      expect(entry).toMatchObject({
        next: new Date(START + 2 * M).toISOString(),
        last: { status: "done", task: "tick", cron: EVERY_MINUTE },
      });
      expect((await list(b)).map((e) => e.task)).toEqual(["open"]);
      expect((await setup(cms).fetch(`${origin}/_tenon/jobs/cron`)).status).toBe(401);
    });
  });
});

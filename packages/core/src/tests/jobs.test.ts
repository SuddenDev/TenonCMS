import { afterEach, describe, expect, it, vi } from "vitest";
import { withDatabase } from "../cms/create-cms.ts";
import type { JobsOptions } from "../jobs/index.ts";
import { defineCms, definePlugin, defineTask, ValidationError } from "../index.ts";
import { boom, calls, greet, jobsCms, onFile, resetJobs, SELECT } from "./jobs-setup.ts";
import { base, origin, setup, testDatabase, testDb, withAdmin } from "./setup.ts";

const DAY = 24 * 3_600_000;
const editor = { name: "Ed", email: "e@b.co", password: "password123" };

afterEach(resetJobs);

describe("running jobs", () => {
  it("runs a queued job with its payload and stores the result", async () => {
    const { cms, rows } = await onFile();
    await cms.jobs.queue("greet", { name: "Ann" });

    expect(await cms.jobs.run()).toEqual({ ran: 1, next: null });
    expect(calls.map((c) => c.payload)).toEqual([{ name: "Ann" }]);
    expect(await rows()).toMatchObject([
      {
        task: "greet",
        status: "done",
        attempts: 1,
        locked_until: null,
        result: JSON.stringify({ greeted: { name: "Ann" } }),
      },
    ]);
    expect(await cms.jobs.run()).toEqual({ ran: 0, next: null });
  });

  it("marks a job done with no result when the return value is not JSON", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const odd = defineTask({ run: ({ payload }) => (payload === "big" ? { n: 1n } : circular) });
    const { cms, rows } = await onFile({ tasks: { odd } });
    await cms.jobs.queue("odd", "big");
    await cms.jobs.queue("odd", "loop");

    expect((await cms.jobs.run()).ran).toBe(2);
    expect(await rows()).toMatchObject([
      { status: "done", attempts: 1, result: null, error: null },
      { status: "done", attempts: 1, result: null, error: null },
    ]);
  });

  it("runs jobs in the order they were queued", async () => {
    const { cms } = await onFile();
    for (const n of [1, 2, 3]) await cms.jobs.queue("greet", n);
    await cms.jobs.run();
    expect(calls.map((c) => c.payload)).toEqual([1, 2, 3]);
  });

  it("waits for runAt and tells when the next job is due", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { cms } = await onFile();
    const runAt = Date.now() + 60_000;
    await cms.jobs.queue("greet", 1, { runAt: new Date(runAt) });

    expect(await cms.jobs.run()).toEqual({ ran: 0, next: runAt });
    vi.setSystemTime(runAt);
    expect(await cms.jobs.run()).toEqual({ ran: 1, next: null });
  });

  it("retries with backoff, then fails and keeps the error", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { cms, rows } = await onFile();
    await cms.jobs.queue("boom");
    const start = Date.now();

    await cms.jobs.run();
    expect(await rows()).toMatchObject([
      { status: "queued", attempts: 1, run_at: start + 60_000, error: "nope", locked_until: null },
    ]);
    expect(await cms.jobs.run()).toEqual({ ran: 0, next: start + 60_000 });

    vi.setSystemTime(start + 60_000);
    await cms.jobs.run();
    expect(await rows()).toMatchObject([
      { status: "queued", attempts: 2, run_at: start + 60_000 + 120_000 },
    ]);

    vi.setSystemTime(start + 180_000);
    await cms.jobs.run();
    expect(await rows()).toMatchObject([{ status: "failed", attempts: 3, error: "nope" }]);
    vi.setSystemTime(start + 10 * DAY);
    expect((await cms.jobs.run()).ran).toBe(0);
  });

  it("deletes done jobs after 30 days and keeps failed ones", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { cms, rows } = await onFile();
    const start = Date.now();
    await cms.jobs.queue("greet");
    await cms.jobs.queue("boom", undefined, { maxAttempts: 1 });
    await cms.jobs.run();

    vi.setSystemTime(start + 29 * DAY);
    await cms.jobs.run();
    expect(await rows()).toHaveLength(2);

    vi.setSystemTime(start + 31 * DAY);
    await cms.jobs.run();
    expect(await rows()).toMatchObject([{ task: "boom", status: "failed" }]);
  });

  it("fails a job that is not defined any more, and keeps it for a retry", async () => {
    const { database, exec } = testDb();
    await jobsCms({}, database).jobs.run();
    await exec(
      `INSERT INTO cms_jobs (id, task, payload, status, run_at, attempts, max_attempts, created_at, updated_at) VALUES ('j1', 'gone', 'null', 'queued', 0, 0, 1, 0, 0)`,
    );
    await jobsCms({}, database).jobs.run();
    expect(await exec(SELECT)).toMatchObject([
      { task: "gone", status: "failed", error: 'Unknown task "gone"' },
    ]);
  });
});

describe("leases", () => {
  const crash = (exec: Awaited<ReturnType<typeof onFile>>["exec"], attempts: number, ms: number) =>
    exec(`UPDATE cms_jobs SET status = 'running', attempts = ?, locked_until = ?`, [
      attempts,
      Date.now() + ms,
    ]);

  it("reclaims a running job once its lease has expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { cms, exec, rows } = await onFile();
    await cms.jobs.queue("greet");
    await crash(exec, 1, 1_000);

    expect((await cms.jobs.run()).ran).toBe(0);
    vi.setSystemTime(Date.now() + 1_001);
    expect((await cms.jobs.run()).ran).toBe(1);
    expect(await rows()).toMatchObject([{ status: "done", attempts: 2 }]);
  });

  it("holds a claimed job for five minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { database, exec } = testDb();
    let lease: unknown;
    const peek = defineTask({
      run: async () => {
        lease = (await exec(`SELECT locked_until FROM cms_jobs`))[0].locked_until;
      },
    });
    const cms = jobsCms({ tasks: { peek } }, database);
    await cms.jobs.queue("peek");
    await cms.jobs.run();
    expect(lease).toBe(Date.now() + 5 * 60_000);
  });

  it("fails a job whose lease expired on its last attempt, without running it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { cms, exec, rows } = await onFile();
    await cms.jobs.queue("greet");
    await crash(exec, 3, -1);

    await cms.jobs.run();
    expect(calls).toEqual([]);
    expect(await rows()).toMatchObject([{ status: "failed" }]);
  });
});

describe("concurrent runs", () => {
  const slow = defineTask({
    run: async ({ job }) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      calls.push({ payload: null, id: job.id });
    },
  });

  it("run a job once for two run() calls on one instance", async () => {
    const { cms } = await onFile({ tasks: { slow } });
    for (let n = 0; n < 3; n++) await cms.jobs.queue("slow");
    const [a, b] = await Promise.all([cms.jobs.run(), cms.jobs.run()]);

    expect(a.ran + b.ran).toBe(3);
    expect(new Set(calls.map((c) => c.id)).size).toBe(3);
    expect(calls).toHaveLength(3);
  });

  it("run a job once for two instances on one database", async () => {
    const { database } = testDb();
    const a = jobsCms({ tasks: { slow } }, database);
    const b = jobsCms({ tasks: { slow } }, database);
    await a.jobs.run();
    for (let n = 0; n < 3; n++) await a.jobs.queue("slow");
    const [x, y] = await Promise.all([a.jobs.run(), b.jobs.run()]);

    expect(x.ran + y.ran).toBe(3);
    expect(new Set(calls.map((c) => c.id)).size).toBe(3);
    expect(calls).toHaveLength(3);
  });
});

describe("queueing", () => {
  const hooked = (jobs: JobsOptions, database = testDatabase()) =>
    defineCms({
      ...base,
      database,
      collections: {
        ...base.collections,
        notes: {
          fields: { title: { type: "text" } },
          hooks: {
            afterChange: [
              async ({ cms }) => {
                await cms.jobs.queue("greet", { from: "hook" });
              },
            ],
          },
        },
        broken: {
          fields: { title: { type: "text" } },
          hooks: {
            afterChange: [
              async ({ cms }) => {
                await cms.jobs.queue("greet");
                throw new ValidationError({ title: "No" });
              },
            ],
          },
        },
      },
      jobs: { ...jobs, tasks: { greet } },
    });

  it("joins the transaction of the hook that queues, and wakes after the commit", async () => {
    const { database, exec } = testDb();
    const wake = vi.fn();
    const cms = withDatabase(hooked({}, database), database, { wake });
    await cms.create("notes", { title: "Hi" });
    expect(await exec(SELECT)).toHaveLength(1);
    expect(wake).toHaveBeenCalledTimes(1);
    expect((await cms.jobs.run()).ran).toBe(1);
    expect(calls[0].payload).toEqual({ from: "hook" });
  });

  it("removes the queued job when the transaction rolls back", async () => {
    const { database, exec } = testDb();
    const wake = vi.fn();
    const cms = withDatabase(hooked({}, database), database, { wake });
    await expect(cms.create("broken", { title: "Hi" })).rejects.toBeInstanceOf(ValidationError);
    expect(await exec(SELECT)).toEqual([]);
    expect(wake).not.toHaveBeenCalled();
  });

  it("wakes at once outside a transaction, with the time the job is due", async () => {
    const wake = vi.fn();
    const database = testDatabase();
    const cms = withDatabase(jobsCms({}, database), database, { wake });
    const runAt = Date.now() + 5_000;
    await cms.jobs.queue("greet", null, { runAt });
    expect(wake).toHaveBeenCalledWith(runAt);
  });

  it("rejects a task that is not defined", async () => {
    await expect(jobsCms().jobs.queue("nope")).rejects.toThrow('unknown task "nope"');
  });
});

describe("startup checks", () => {
  const withJobs = (jobs: JobsOptions) => () => jobsCms(jobs);

  it("throw for a scheduled task that is not defined, and for a bad cron pattern", () => {
    expect(withJobs({ scheduledTasks: { "* * * * *": ["missing"] } })).toThrow('"missing"');
    expect(withJobs({ scheduledTasks: { "not a cron": ["greet"] } })).toThrow('"not a cron"');
    expect(withJobs({ scheduledTasks: { "0 3 * * *": ["greet"] } })).not.toThrow();
  });

  it("throw for the reserved tenon: prefix and for unknown roles", () => {
    expect(withJobs({ tasks: { "tenon:x": greet } })).toThrow('"tenon:"');
    expect(
      withJobs({ tasks: { audit: defineTask({ access: ["ghost"], run: () => {} }) } }),
    ).toThrow('role "ghost"');
  });
});

describe("plugin tasks", () => {
  const audit = (jobs: JobsOptions) => definePlugin({ name: "audit", jobs });
  const withPlugins = (...plugins: Array<ReturnType<typeof audit>>) =>
    defineCms({ ...base, plugins, jobs: { tasks: { greet } } });

  it("run like host tasks, and their cron entries are accepted", async () => {
    const ping = defineTask({
      run: () => {
        calls.push({ payload: "ping", id: "" });
      },
    });
    const cms = withPlugins(
      audit({ tasks: { "audit:ping": ping }, scheduledTasks: { "0 3 * * *": ["audit:ping"] } }),
    );
    await cms.jobs.queue("audit:ping");
    expect((await cms.jobs.run()).ran).toBe(1);
    expect(calls.map((c) => c.payload)).toEqual(["ping"]);
  });

  it("throw for a task without the plugin name as prefix", () => {
    expect(() => withPlugins(audit({ tasks: { ping: greet } }))).toThrow('"audit:"');
  });

  it("throw when a plugin schedules a task it does not own", () => {
    expect(() =>
      withPlugins(
        audit({ tasks: { "audit:ping": greet }, scheduledTasks: { "0 3 * * *": ["greet"] } }),
      ),
    ).toThrow('"greet"');
  });

  it("throw when a plugin task and a host task share a name", () => {
    expect(() =>
      defineCms({
        ...base,
        plugins: [audit({ tasks: { "audit:ping": greet } })],
        jobs: { tasks: { "audit:ping": greet } },
      }),
    ).toThrow('duplicate task "audit:ping"');
  });
});

describe("/jobs/run", () => {
  const run = (cms: ReturnType<typeof jobsCms>, method: string, token?: string) =>
    setup(cms).fetch(`${origin}/_tenon/jobs/run`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it("is not mounted without a secret", async () => {
    const env = await withAdmin(jobsCms());
    expect((await env.fetch(`${origin}/_tenon/jobs/run`)).status).toBe(404);
  });

  it("answers 401 without the secret or with a wrong one, and runs the jobs with it", async () => {
    const cms = jobsCms({ secret: "s3cret" });
    await cms.jobs.queue("greet", 1);

    expect((await run(cms, "GET")).status).toBe(401);
    expect((await run(cms, "POST", "wrong")).status).toBe(401);
    expect(calls).toEqual([]);

    const res = await run(cms, "GET", "s3cret");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ran: 1, next: null });

    await cms.jobs.queue("greet", 2);
    expect(await (await run(cms, "POST", "s3cret")).json()).toEqual({ ran: 1, next: null });
  });
});

describe("job routes", () => {
  const tasks = {
    open: defineTask({ access: ["editor"], run: () => {} }),
    nobody: defineTask({ access: false, run: () => {} }),
    ed: defineTask({ access: ({ user }) => user?.name === "Ed", run: () => {} }),
  };

  /** An admin and a signed-in editor on one instance. */
  async function users() {
    const cms = jobsCms({ tasks });
    const a = await withAdmin(cms);
    await a.create(editor);
    const b = setup(cms);
    await b.client.signIn(editor);
    const list = async (s: { fetch: typeof fetch }, query = "") =>
      ((await (await s.fetch(`${origin}/_tenon/jobs${query}`)).json()) as Array<{ task: string }>)
        .map((j) => j.task)
        .sort();
    return { cms, a, b, list };
  }

  it("list the jobs of the tasks a user may access, admin only by default", async () => {
    const { cms, a, b, list } = await users();
    for (const task of ["greet", "open", "nobody", "ed"]) await cms.jobs.queue(task);

    expect(await list(a)).toEqual(["greet"]);
    expect(await list(b)).toEqual(["ed", "open"]);
  });

  it("filter by status and task, and need a session", async () => {
    const { cms, a } = await users();
    await cms.jobs.queue("greet");
    await cms.jobs.queue("boom", null, { maxAttempts: 1 });
    await cms.jobs.run();
    const list = async (query: string) =>
      (await (await a.fetch(`${origin}/_tenon/jobs${query}`)).json()) as Array<{ task: string }>;

    expect((await list("?status=failed")).map((j) => j.task)).toEqual(["boom"]);
    expect(await list("?task=greet")).toMatchObject([
      { task: "greet", status: "done", attempts: 1, maxAttempts: 3, user: null },
    ]);
    expect((await a.fetch(`${origin}/_tenon/jobs?status=bogus`)).status).toBe(400);
    expect((await setup(cms).fetch(`${origin}/_tenon/jobs`)).status).toBe(401);
  });

  it("cancel a queued job, answer 409 to cancel or run a running one and 404 for a missing one", async () => {
    const { database, exec } = testDb();
    const cms = jobsCms({}, database);
    const a = await withAdmin(cms);
    const { id } = await cms.jobs.queue("greet");
    const del = (id: string) => a.fetch(`${origin}/_tenon/jobs/${id}`, { method: "DELETE" });

    await exec(`UPDATE cms_jobs SET status = 'running', locked_until = ?`, [Date.now() + 60_000]);
    expect((await del(id)).status).toBe(409);
    expect((await a.fetch(`${origin}/_tenon/jobs/${id}/run`, { method: "POST" })).status).toBe(409);
    await exec(`UPDATE cms_jobs SET status = 'queued', locked_until = NULL`);
    expect((await del(id)).status).toBe(204);
    expect(await exec(`SELECT id FROM cms_jobs`)).toEqual([]);
    expect((await del(id)).status).toBe(404);
  });

  it("deny cancel, retry and run for a task the user may not access", async () => {
    const { cms, b } = await users();
    const { id } = await cms.jobs.queue("greet");
    for (const [method, path] of [
      ["DELETE", ""],
      ["POST", "/retry"],
      ["POST", "/run"],
    ])
      expect((await b.fetch(`${origin}/_tenon/jobs/${id}${path}`, { method })).status).toBe(403);
  });

  it("retry a failed job and run a queued job now", async () => {
    const { cms, a } = await users();
    const failed = await cms.jobs.queue("boom", null, { maxAttempts: 1 });
    await cms.jobs.run();
    const send = async (id: string, action: string) => {
      const res = await a.fetch(`${origin}/_tenon/jobs/${id}/${action}`, { method: "POST" });
      return { status: res.status, job: await res.json() };
    };

    expect(await send(failed.id, "retry")).toMatchObject({
      status: 200,
      job: { status: "queued", attempts: 0, error: null },
    });
    expect((await send(failed.id, "retry")).status).toBe(409);

    const later = await cms.jobs.queue("greet", 7, { runAt: Date.now() + DAY });
    expect(await send(later.id, "run")).toMatchObject({
      status: 200,
      job: { status: "done", result: { greeted: 7 } },
    });
    expect((await send(later.id, "run")).status).toBe(409);
  });
});

describe("client.jobs", () => {
  const tasks = { greet, boom };

  it("lists, runs, retries and cancels jobs with the same rules as the routes", async () => {
    const cms = jobsCms({ tasks, scheduledTasks: { "0 3 * * *": ["greet"] } });
    const { client } = await withAdmin(cms);
    const later = await cms.jobs.queue("greet", 7, { runAt: Date.now() + DAY });
    const failed = await cms.jobs.queue("boom", null, { maxAttempts: 1 });
    await cms.jobs.run();

    expect((await client.jobs.list({ status: "failed" })).map((j) => j.id)).toEqual([failed.id]);
    expect(await client.jobs.retry(failed.id)).toMatchObject({ status: "queued", attempts: 0 });
    expect(await client.jobs.run(later.id)).toMatchObject({
      status: "done",
      result: { greeted: 7 },
    });
    await expect(client.jobs.cancel(failed.id)).resolves.toBeUndefined();
    expect(await client.jobs.list({ task: "boom" })).toEqual([]);
    expect(await client.jobs.cron()).toMatchObject([{ pattern: "0 3 * * *", task: "greet" }]);
  });
});

describe("run now on a failed job", () => {
  it("requeues the job with all its attempts and runs it in one step", async () => {
    let fail = true;
    const flaky = defineTask({
      run: () => {
        if (fail) throw new Error("not yet");
        return "ok";
      },
    });
    const cms = jobsCms({ tasks: { flaky } });
    const a = await withAdmin(cms);
    const { id } = await cms.jobs.queue("flaky", null, { maxAttempts: 1 });
    await cms.jobs.run();
    const run = () => a.fetch(`${origin}/_tenon/jobs/${id}/run`, { method: "POST" });

    fail = false;
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "done",
      attempts: 1,
      error: null,
      result: "ok",
    });
    expect((await run()).status).toBe(409);
  });
});

describe("keys", () => {
  it("keeps one queued job per task and key until it runs", async () => {
    const { cms } = await onFile();
    const first = await cms.jobs.queue("greet", 1, { key: "k" });
    expect(await cms.jobs.queue("greet", 2, { key: "k" })).toEqual(first);
    expect(await cms.jobs.queue("greet", 3, { key: "other" })).not.toEqual(first);
    expect(await cms.jobs.queue("greet", 4)).not.toEqual(first);

    await cms.jobs.run();
    expect(calls.map((c) => c.payload)).toEqual([1, 3, 4]);
    expect(await cms.jobs.queue("greet", 5, { key: "k" })).not.toEqual(first);
  });

  it("merges into the payload of the job that waits", async () => {
    const { cms } = await onFile();
    const merge = (queued: unknown, next: unknown) => [
      ...(queued as number[]),
      ...(next as number[]),
    ];
    await cms.jobs.queue("greet", [1], { key: "k", merge });
    await cms.jobs.queue("greet", [2], { key: "k", merge });

    await cms.jobs.run();
    expect(calls.map((c) => c.payload)).toEqual([[1, 2]]);
  });
});

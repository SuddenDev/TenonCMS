import { afterEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors.ts";
import { defineCms, defineTask } from "../index.ts";
import {
  localized,
  origin,
  setup,
  status,
  testDatabase,
  testDb,
  withAdmin,
  fastAuth,
} from "./setup.ts";

const HOUR = 3_600_000;
const editor = { name: "Ed", email: "e@b.co", password: "password123" };

const make = (database = testDatabase()) =>
  defineCms({
    collections: {
      posts: {
        schedule: true,
        fields: { title: { type: "text", required: true } },
      },
      pages: { fields: { title: { type: "text" } } },
      locked: {
        schedule: true,
        access: { update: ["admin"] },
        fields: { title: { type: "text" } },
      },
      mine: {
        schedule: true,
        access: { update: ({ user }) => (user ? { owner: user.id } : false) },
        fields: { title: { type: "text" }, owner: { type: "text" } },
      },
    },
    globals: {
      site: { schedule: true, fields: { name: { type: "text" } } },
      plain: { fields: { name: { type: "text" } } },
    },
    jobs: { tasks: { secret: defineTask({ meta: { description: "Hidden" }, run: () => {} }) } },
    media: false,
    settings: false,
    database,
    secret: "x".repeat(32),
    auth: fastAuth,
  });

afterEach(() => vi.useRealTimers());

/** Moves the clock, which only fakes `Date`, to `time`. */
function travelTo(time: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
}

const errors = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => (e instanceof ValidationError ? e.errors : e),
  );

type JobRow = {
  task: string;
  status: string;
  result: string | null;
  target: string | null;
  doc_id: string | null;
  locale: string | null;
  created_by: string | null;
};
const SELECT = `SELECT task, status, result, target, doc_id, locale, created_by FROM cms_jobs ORDER BY created_at`;

describe("startup check", () => {
  const entry = { drafts: false, schedule: true, fields: { title: { type: "text" } } } as const;
  const build = (extra: object) =>
    defineCms({
      media: false,
      settings: false,
      database: testDatabase(),
      secret: "x".repeat(32),
      auth: fastAuth,
      ...extra,
    });

  it("throws for schedule with drafts: false", () => {
    expect(() => build({ collections: { logs: entry } })).toThrow(/"logs".*schedule.*drafts/);
    expect(() => build({ globals: { flags: entry } })).toThrow(/"flags".*schedule.*drafts/);
  });
});

describe("schedule", () => {
  it("queues a job with the target of the document", async () => {
    const { database, exec } = testDb();
    const cms = make(database);
    const post = await cms.create("posts", { title: "A" }, { draft: true });
    const at = new Date(Date.now() + HOUR);

    const { id } = (await cms.schedule("posts", post.id, { action: "publish", at }))!;
    expect(id).toEqual(expect.any(String));
    expect(await exec(SELECT)).toMatchObject([
      { task: "tenon:publish", status: "queued", target: "collection:posts", doc_id: post.id },
    ]);
    expect(await cms.jobs.run()).toEqual({ ran: 0, next: at.getTime() });
  });

  it("rejects an entry without the schedule flag, a global without a draft and a bad input", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "A" });
    const post = await cms.create("posts", { title: "A" }, { draft: true });
    const future = new Date(Date.now() + HOUR);

    expect(await errors(cms.schedule("pages", page.id, { action: "publish", at: future }))).toEqual(
      {
        "": 'Scheduling is off for "pages"',
      },
    );
    expect(await errors(cms.scheduleGlobal("plain", { action: "publish", at: future }))).toEqual({
      "": 'Scheduling is off for "plain"',
    });
    expect(await errors(cms.scheduleGlobal("site", { action: "publish", at: future }))).toEqual({
      "": "Nothing to publish",
    });
    expect(
      await errors(cms.schedule("posts", post.id, { action: "publish", at: "soon" })),
    ).toHaveProperty("at");
    expect(
      await errors(cms.schedule("posts", post.id, { action: "burn" as never, at: future })),
    ).toHaveProperty("action");
    expect(
      await errors(
        cms.schedule("posts", post.id, { action: "publish", at: future, locale: "de" as never }),
      ),
    ).toHaveProperty("locale");
    await expect(
      cms.schedule("nope" as never, post.id, { action: "publish", at: future }),
    ).rejects.toThrow(/Unknown collection/);
    expect((await cms.jobs.run()).next).toBeNull();
  });

  it("accepts a time in the past, which is due at once", async () => {
    const cms = make();
    const post = await cms.create("posts", { title: "Now" }, { draft: true });
    await cms.schedule("posts", post.id, { action: "publish", at: Date.now() - HOUR });

    expect(await cms.jobs.run()).toMatchObject({ ran: 1 });
    expect(await cms.find("posts")).toMatchObject([{ title: "Now" }]);
  });

  it("publishes a draft that was never published", async () => {
    const cms = make();
    const post = await cms.create("posts", { title: "Soon" }, { draft: true });
    const at = Date.now() + HOUR;
    await cms.schedule("posts", post.id, { action: "publish", at });

    travelTo(at);
    await cms.jobs.run();
    expect(await cms.find("posts")).toMatchObject([{ title: "Soon" }]);
  });

  it("unpublishes when the job fires and keeps the content as the draft", async () => {
    const { database, exec } = testDb();
    const cms = make(database);
    const post = await cms.create("posts", { title: "Live" });
    const at = Date.now() + HOUR;
    await cms.schedule("posts", post.id, { action: "unpublish", at });
    expect(await cms.find("posts")).toHaveLength(1);

    travelTo(at);
    await cms.jobs.run();
    expect(await cms.find("posts")).toEqual([]);
    expect(await cms.withDrafts().findById("posts", post.id)).toMatchObject({
      title: "Live",
      publishedAt: null,
      hasDraft: true,
    });
    expect(await exec(SELECT)).toMatchObject([
      { task: "tenon:unpublish", status: "done", result: '"unpublished"' },
    ]);
  });

  it("publishes and unpublishes a global", async () => {
    const { database, exec } = testDb();
    const cms = make(database);
    await cms.setGlobal("site", { name: "Live" });
    await cms.setGlobal("site", { name: "Next" }, { draft: true });
    const at = Date.now() + HOUR;
    await cms.scheduleGlobal("site", { action: "publish", at });
    await cms.scheduleGlobal("site", { action: "unpublish", at: at + HOUR });
    expect(await exec(SELECT)).toMatchObject([
      { target: "global:site", doc_id: "", locale: null },
      { target: "global:site", doc_id: "" },
    ]);

    travelTo(at);
    await cms.jobs.run();
    expect(await cms.getGlobal("site")).toMatchObject({ name: "Next" });

    travelTo(at + HOUR);
    await cms.jobs.run();
    expect(await cms.getGlobal("site")).toEqual({ publishedAt: null, hasDraft: false });
    expect(await cms.withDrafts().getGlobal("site")).toMatchObject({ name: "Next" });
  });

  it("acts on one locale", async () => {
    const { database, exec } = testDb();
    const s = localized({ database, collections: { posts: { schedule: true } } });
    const { cms } = s;
    const strict = (locale: string) => ({ locale, fallback: false }) as never;
    const post = await cms.create("posts", { title: "Hello" });
    await cms.update("posts", post.id, { title: "Hallo" }, { locale: "de" } as never);
    await cms.update("posts", post.id, { title: "Hallo 2" }, {
      locale: "de",
      draft: true,
    } as never);
    const at = Date.now() + HOUR;

    await cms.schedule("posts", post.id, { action: "publish", at, locale: "de" } as never);
    await cms.schedule("posts", post.id, {
      action: "unpublish",
      at: at + HOUR,
      locale: "en",
    } as never);
    expect(await exec(SELECT)).toMatchObject([{ locale: "de" }, { locale: "en" }]);

    travelTo(at);
    await cms.jobs.run();
    expect(await cms.findById("posts", post.id, strict("de"))).toMatchObject({ title: "Hallo 2" });
    expect(await cms.findById("posts", post.id, strict("en"))).toMatchObject({ title: "Hello" });

    travelTo(at + HOUR);
    await cms.jobs.run();
    expect(await cms.findById("posts", post.id, strict("en"))).toBeUndefined();
    expect(await cms.findById("posts", post.id, strict("de"))).toMatchObject({ title: "Hallo 2" });
  });

  it("replaces the queued job of the same action and locale", async () => {
    const { database, exec } = testDb();
    const s = localized({ database, collections: { posts: { schedule: true } } });
    const { cms } = s;
    const post = await cms.create("posts", { title: "Hello" }, { draft: true });
    await cms.update("posts", post.id, { title: "Hallo" }, { locale: "de", draft: true } as never);
    const other = await cms.create("posts", { title: "Other" }, { draft: true });
    const at = Date.now() + HOUR;
    const plan = (id: string, action: "publish" | "unpublish", locale: string, time = at) =>
      cms.schedule("posts", id, { action, at: time, locale } as never);

    await plan(post.id, "publish", "en");
    await plan(post.id, "publish", "de");
    await plan(post.id, "unpublish", "en");
    await plan(other.id, "publish", "en");
    await plan(post.id, "publish", "en", at + HOUR);

    const rows = await exec(
      `SELECT task, doc_id, locale, run_at FROM cms_jobs ORDER BY created_at`,
    );
    expect(rows.map((r) => [r.task, r.doc_id, r.locale, Number(r.run_at)])).toEqual([
      ["tenon:publish", post.id, "de", at],
      ["tenon:unpublish", post.id, "en", at],
      ["tenon:publish", other.id, "en", at],
      ["tenon:publish", post.id, "en", at + HOUR],
    ]);
  });

  it("stores no locale for an entry that is not localized", async () => {
    const { database, exec } = testDb();
    const s = localized({
      database,
      collections: { authors: { schedule: true, fields: { name: { type: "text" } } } },
    });
    const author = await s.cms.create("authors", { name: "A" }, { draft: true });
    await s.cms.schedule("authors", author.id, { action: "publish", at: Date.now() + HOUR });
    expect(await exec(SELECT)).toMatchObject([{ locale: null }]);
  });

  it("returns undefined and queues nothing for a document that does not exist", async () => {
    const { database, exec } = testDb();
    const cms = make(database);
    const draftOnly = await cms.create("posts", { title: "Soon" }, { draft: true });
    const at = Date.now() + HOUR;

    expect(await cms.schedule("posts", "nope", { action: "publish", at })).toBeUndefined();
    expect(await exec(SELECT)).toEqual([]);
    expect(await cms.schedule("posts", draftOnly.id, { action: "publish", at })).toHaveProperty(
      "id",
    );
    expect(await exec(SELECT)).toHaveLength(1);
  });

  it("ends as missing when the document was deleted", async () => {
    const { database, exec } = testDb();
    const cms = make(database);
    const post = await cms.create("posts", { title: "A" }, { draft: true });
    const at = Date.now() + HOUR;
    await cms.schedule("posts", post.id, { action: "publish", at });
    await cms.schedule("posts", post.id, { action: "unpublish", at });
    await cms.delete("posts", post.id);

    travelTo(at);
    expect(await cms.jobs.run()).toMatchObject({ ran: 2 });
    expect(await exec(SELECT)).toMatchObject([
      { status: "done", result: '"missing"' },
      { status: "done", result: '"missing"' },
    ]);
  });
});

describe("over HTTP", () => {
  /** An admin and a signed-in editor on one instance. */
  async function users() {
    const { database, exec } = testDb();
    const cms = make(database);
    const a = await withAdmin(cms);
    const user = await a.create(editor);
    const b = setup(cms);
    await b.client.signIn(editor);
    return { cms, a, b, exec, editorId: user.id };
  }
  const send = (s: { fetch: typeof fetch }, path: string, body: unknown) =>
    s.fetch(`${origin}/_tenon${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const jobs = async (s: { fetch: typeof fetch }, query: string) =>
    (await (await s.fetch(`${origin}/_tenon/jobs${query}`)).json()) as Array<{
      id: string;
      task: string;
      target: string;
      docId: string;
      locale: string | null;
      runAt: string;
      user: { name: string } | null;
    }>;

  it("needs a session", async () => {
    const s = setup(make());
    const body = { action: "publish", at: new Date(Date.now() + HOUR).toISOString() };
    expect((await send(s, "/collections/posts/x/schedule", body)).status).toBe(401);
    expect((await send(s, "/globals/site/schedule", body)).status).toBe(401);
  });

  it("schedules through the routes and the client, and answers 400 for a bad body", async () => {
    const { a } = await users();
    const post = await a.client.createDraft("posts", { title: "A" });
    await a.client.setGlobalDraft("site", { name: "A" });
    const at = new Date(Date.now() + HOUR);

    const res = await send(a, `/collections/posts/${post.id}/schedule`, {
      action: "unpublish",
      at: at.toISOString(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: expect.any(String) });
    expect(await a.client.schedule("posts", post.id, { action: "publish", at })).toEqual({
      id: expect.any(String),
    });
    expect(await a.client.scheduleGlobal("site", { action: "publish", at })).toEqual({
      id: expect.any(String),
    });

    const gone = await send(a, "/collections/posts/nope/schedule", {
      action: "publish",
      at: at.toISOString(),
    });
    expect(gone.status).toBe(404);
    expect(await status(a.client.schedule("posts", "nope", { action: "publish", at }))).toBe(404);

    for (const body of [{}, { action: "publish" }, { action: "x", at: at.toISOString() }])
      expect((await send(a, `/collections/posts/${post.id}/schedule`, body)).status).toBe(400);
    expect(
      (
        await send(a, `/collections/pages/${post.id}/schedule`, {
          action: "publish",
          at: at.toISOString(),
        })
      ).status,
    ).toBe(400);
    expect((await send(a, `/collections/nope/${post.id}/schedule`, {})).status).toBe(404);
    expect((await send(a, "/globals/nope/schedule", {})).status).toBe(404);
    expect(
      (
        await send(a, `/collections/posts/${post.id}/schedule`, {
          action: "publish",
          at: "soon",
        })
      ).status,
    ).toBe(400);
  });

  it("answers 403 without the update rule", async () => {
    const { a, b } = await users();
    const doc = await a.client.createDraft("locked", { title: "A" });
    const at = new Date(Date.now() + HOUR);

    expect(await status(b.client.schedule("locked", doc.id, { action: "publish", at }))).toBe(403);
    expect(await a.client.schedule("locked", doc.id, { action: "publish", at })).toHaveProperty(
      "id",
    );
    expect(await jobs(a, "")).toHaveLength(1);
  });

  it("lists and cancels the jobs of a document for an editor who may update it", async () => {
    const { a, b } = await users();
    const post = await a.client.createDraft("posts", { title: "A" });
    const other = await a.client.createDraft("posts", { title: "B" });
    const at = new Date(Date.now() + HOUR);
    await b.client.schedule("posts", post.id, { action: "publish", at });
    await a.client.schedule("posts", other.id, { action: "publish", at });
    await a.client.scheduleGlobal("site", { action: "unpublish", at });

    const query = `?status=queued&target=collection:posts&docId=${post.id}`;
    const [job] = await jobs(b, query);
    expect(await jobs(b, query)).toHaveLength(1);
    expect(job).toMatchObject({
      task: "tenon:publish",
      target: "collection:posts",
      docId: post.id,
      runAt: at.toISOString(),
      user: { name: "Ed" },
    });
    expect(await jobs(a, query)).toHaveLength(1);
    expect(await jobs(b, "?target=global:site&docId=")).toHaveLength(1);
    expect(await jobs(b, "")).toHaveLength(3);

    expect((await b.fetch(`${origin}/_tenon/jobs/${job.id}`, { method: "DELETE" })).status).toBe(
      204,
    );
    expect(await jobs(b, query)).toEqual([]);
  });

  it("hides the jobs of a document the user may not update, and answers 403 for them", async () => {
    const { a, b } = await users();
    const doc = await a.client.createDraft("locked", { title: "A" });
    const at = new Date(Date.now() + HOUR);
    const { id } = await a.client.schedule("locked", doc.id, { action: "publish", at });

    expect(await jobs(b, "")).toEqual([]);
    expect(await jobs(b, `?target=collection:locked&docId=${doc.id}`)).toEqual([]);
    for (const [method, path] of [
      ["DELETE", ""],
      ["POST", "/run"],
      ["POST", "/retry"],
    ])
      expect((await b.fetch(`${origin}/_tenon/jobs/${id}${path}`, { method })).status).toBe(403);
    expect(await jobs(a, "")).toHaveLength(1);
  });

  it("applies a where rule of the update access to the document of the job", async () => {
    const { cms, a, b, editorId } = await users();
    const mine = await cms.create("mine", { title: "A", owner: editorId }, { draft: true });
    const theirs = await cms.create("mine", { title: "B", owner: "someone" }, { draft: true });
    const at = new Date(Date.now() + HOUR);
    await cms.schedule("mine", mine.id, { action: "publish", at });
    await cms.schedule("mine", theirs.id, { action: "publish", at });

    expect((await jobs(b, "")).map((j) => j.docId)).toEqual([mine.id]);
    expect(await jobs(a, "")).toEqual([]);
    expect(await status(b.client.schedule("mine", theirs.id, { action: "publish", at }))).toBe(403);
    expect(await b.client.schedule("mine", mine.id, { action: "unpublish", at })).toHaveProperty(
      "id",
    );
  });

  it("keeps the task rule for jobs without a target", async () => {
    const { cms, a, b } = await users();
    const post = await a.client.createDraft("posts", { title: "A" });
    await cms.schedule("posts", post.id, { action: "publish", at: Date.now() + HOUR });
    await cms.jobs.queue("secret");

    expect((await jobs(a, "")).map((j) => j.task).sort()).toEqual(["secret", "tenon:publish"]);
    expect((await jobs(b, "")).map((j) => j.task)).toEqual(["tenon:publish"]);
  });

  it("runs a scheduled job now and reports a document that is gone", async () => {
    const { a, b, cms } = await users();
    const post = await a.client.create("posts", { title: "A" });
    const { id } = await b.client.schedule("posts", post.id, {
      action: "unpublish",
      at: new Date(Date.now() + HOUR),
    });

    const res = await b.fetch(`${origin}/_tenon/jobs/${id}/run`, { method: "POST" });
    expect(await res.json()).toMatchObject({ status: "done", result: "unpublished" });
    expect(await cms.find("posts")).toEqual([]);
  });
});

describe("/schema", () => {
  const schema = async (s: { fetch: typeof fetch }) =>
    (await (await s.fetch(`${origin}/_tenon/schema`)).json()) as {
      collections: Record<string, { schedule?: boolean }>;
      globals: Record<string, { schedule?: boolean }>;
      jobs: Array<{ name: string; description: string }>;
    };

  it("sends the schedule flag as it is", async () => {
    const a = await withAdmin(make());
    const json = await schema(a);
    expect(json.collections.posts.schedule).toBe(true);
    expect(json.collections.pages.schedule).toBeUndefined();
    expect(json.globals.site.schedule).toBe(true);
  });

  it("lists the tasks the user may see", async () => {
    const cms = make();
    const a = await withAdmin(cms);
    await a.create(editor);
    const b = setup(cms);
    await b.client.signIn(editor);

    expect((await schema(a)).jobs.map((j) => j.name).sort()).toEqual([
      "secret",
      "tenon:publish",
      "tenon:unpublish",
    ]);
    expect((await schema(a)).jobs.find((j) => j.name === "secret")).toEqual({
      name: "secret",
      description: "Hidden",
    });
    expect((await schema(b)).jobs.map((j) => j.name).sort()).toEqual([
      "tenon:publish",
      "tenon:unpublish",
    ]);
    expect((await setup(cms).fetch(`${origin}/_tenon/schema`)).status).toBe(401);
  });

  it("leaves the built-in tasks out when the user may update no scheduled entry", async () => {
    const cms = defineCms({
      collections: {
        locked: { schedule: true, access: { update: ["admin"] }, fields: { t: { type: "text" } } },
      },
      media: false,
      settings: false,
      database: testDatabase(),
      secret: "x".repeat(32),
      auth: fastAuth,
    });
    const a = await withAdmin(cms);
    await a.create(editor);
    const b = setup(cms);
    await b.client.signIn(editor);

    expect((await schema(a)).jobs).toHaveLength(2);
    expect((await schema(b)).jobs).toEqual([]);
  });
});

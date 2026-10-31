import { beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "../errors.ts";
import { defineCms } from "../index.ts";
import { page } from "../presets/index.ts";
import { admin, origin, relational, seed, setup, testDatabase, testDb } from "./setup.ts";

let db: ReturnType<typeof testDb>;
let cms: ReturnType<typeof relational>;
let ids: Awaited<ReturnType<typeof seed>>;
beforeEach(async () => {
  db = testDb();
  cms = relational(db.database);
  ids = await seed(cms);
});

// The draft write API comes later, so these tests write drafts through SQL.
const sql = (statement: string, args: unknown[]) => db.exec(statement, args);
/** Sets a pending draft on a published document. */
const draft = (id: string, data: object) =>
  sql(`UPDATE cms_documents SET draft = ? WHERE id = ?`, [JSON.stringify(data), id]);
/** Turns a document into one that was never published. */
const unpublished = (id: string, data: object) =>
  sql(`UPDATE cms_documents SET draft = ?, data = '{}', published_at = NULL WHERE id = ?`, [
    JSON.stringify(data),
    id,
  ]);

describe("meta", () => {
  it("has publishedAt and hasDraft on create and on reads", async () => {
    expect(ids.t1).toMatchObject({ publishedAt: ids.t1.createdAt, hasDraft: false });
    expect(await cms.findById("tags", ids.t1.id)).toMatchObject({
      publishedAt: ids.t1.createdAt,
      hasDraft: false,
    });
    await draft(ids.t1.id, { name: "uno" });
    expect(await cms.findById("tags", ids.t1.id)).toMatchObject({ name: "one", hasDraft: true });
  });

  it("selects publishedAt and hasDraft", async () => {
    expect(
      await cms.findById("tags", ids.t1.id, { select: { publishedAt: true, hasDraft: true } }),
    ).toEqual({ id: ids.t1.id, publishedAt: ids.t1.createdAt, hasDraft: false });
  });

  it("is on globals", async () => {
    expect(await cms.getGlobal("site")).toEqual({ publishedAt: null, hasDraft: false });
    await cms.setGlobal("site", { featured: [] });
    expect(await cms.getGlobal("site")).toMatchObject({
      publishedAt: expect.any(String),
      hasDraft: false,
    });
  });
});

describe("published perspective", () => {
  it("hides documents that were never published", async () => {
    await unpublished(ids.p.id, { title: "Draft" });
    expect(await cms.find("posts")).toEqual([]);
    expect(await cms.findById("posts", ids.p.id)).toBeUndefined();
  });

  it("reads published data and filters on it", async () => {
    await draft(ids.t1.id, { name: "uno" });
    expect(await cms.find("tags", { where: { name: "one" } })).toHaveLength(1);
    expect(await cms.find("tags", { where: { name: "uno" } })).toEqual([]);
  });

  it("does not populate unpublished targets or joins", async () => {
    await unpublished(ids.a.id, { name: "Draft Ann" });
    expect(await cms.findById("posts", ids.p.id)).toMatchObject({ author: null });
    await unpublished(ids.p.id, { title: "Draft", author: ids.a.id });
    expect(
      await cms.findById("tags", ids.t1.id, { populate: { posts: true }, select: { posts: true } }),
    ).toEqual({ id: ids.t1.id, posts: [] });
  });
});

describe("drafts perspective", () => {
  it("reads every document with its draft", async () => {
    await unpublished(ids.p.id, { title: "Draft", author: ids.a.id });
    await draft(ids.a.id, { name: "Draft Ann" });
    const doc = await cms.withDrafts().findById("posts", ids.p.id);
    expect(doc).toMatchObject({
      title: "Draft",
      publishedAt: null,
      hasDraft: true,
      author: { name: "Draft Ann" },
    });
    expect(await cms.withDrafts().find("posts")).toHaveLength(1);
  });

  it("filters on draft data", async () => {
    await draft(ids.t1.id, { name: "uno" });
    expect(await cms.withDrafts().find("tags", { where: { name: "uno" } })).toHaveLength(1);
    expect(await cms.withDrafts().find("tags", { where: { name: "one" } })).toEqual([]);
  });

  it("populates joins from drafts", async () => {
    await draft(ids.p.id, { title: "Hi", tags: [ids.t2.id] });
    const read = (api: typeof cms) =>
      api.findById("tags", ids.t1.id, { populate: { posts: true } });
    expect((await read(cms))?.posts).toHaveLength(1);
    expect((await read(cms.withDrafts()))?.posts).toEqual([]);
  });

  it("reads global drafts", async () => {
    await cms.setGlobal("site", { featured: [ids.p.id] });
    await sql(`UPDATE cms_globals SET draft = ? WHERE name = 'site'`, ['{"featured":[]}']);
    expect(await cms.getGlobal("site", { populate: false })).toMatchObject({
      featured: [ids.p.id],
      hasDraft: true,
    });
    expect(await cms.withDrafts().getGlobal("site", { populate: false })).toMatchObject({
      featured: [],
    });
  });

  it("is passed to hooks", async () => {
    const seen: unknown[] = [];
    const hooked = relational(db.database);
    // Hooks on the instance's own schema object, which core reads.
    (hooked.schema.collections!.tags as { hooks?: object }).hooks = {
      afterRead: [
        async ({ docs, cms }: any) => {
          seen.push((await cms.find("posts", { populate: false })).length);
          return docs;
        },
      ],
    } as never;
    await unpublished(ids.p.id, { title: "Draft" });
    await hooked.find("tags");
    await hooked.withDrafts().find("tags");
    expect(seen).toEqual([0, 1]);
  });

  it("is available to hooks through withDrafts()", async () => {
    const seen: unknown[] = [];
    const hooked = relational(db.database);
    (hooked.schema.collections!.tags as { hooks?: object }).hooks = {
      afterRead: [
        async ({ docs, cms }: any) => {
          seen.push((await cms.withDrafts().find("posts", { populate: false })).length);
          return docs;
        },
      ],
    } as never;
    await unpublished(ids.p.id, { title: "Draft" });
    await hooked.find("tags");
    expect(seen).toEqual([1]);
  });
});

describe("preview over HTTP", () => {
  let s: ReturnType<typeof setup<typeof cms>>;
  beforeEach(async () => {
    s = setup(cms);
    await unpublished(ids.p.id, { title: "Draft" });
  });
  const titles = async () => (await s.client.find("posts")).map((p) => p.title);

  it("reads drafts only with the cookie and a session", async () => {
    expect(await titles()).toEqual([]);
    await s.client.signUp(admin);
    expect(await titles()).toEqual([]);
    await s.client.preview.enter();
    expect(await titles()).toEqual(["Draft"]);
    await s.client.preview.enter("published");
    expect(await titles()).toEqual([]);
    await s.client.preview.enter("drafts");
    expect(await titles()).toEqual(["Draft"]);
    await s.client.preview.exit();
    expect(await titles()).toEqual([]);
  });

  it("ignores the cookie without a session", async () => {
    const res = await cms.fetch(
      new Request(`${origin}/_tenon/collections/posts`, {
        headers: { cookie: "tenon-preview=drafts" },
      }),
    );
    expect(await res.json()).toEqual([]);
  });

  it("sets and clears the cookie", async () => {
    await s.client.signUp(admin);
    const call = (method: string, body?: object) =>
      s.fetch(`${origin}/_tenon/preview`, {
        method,
        headers: { "content-type": "application/json" },
        body: body && JSON.stringify(body),
      });
    const enter = await call("POST");
    expect(enter.status).toBe(204);
    expect(enter.headers.get("set-cookie")).toBe("tenon-preview=drafts; Path=/; SameSite=Lax");
    const published = await call("POST", { perspective: "published" });
    expect(published.headers.get("set-cookie")).toBe(
      "tenon-preview=published; Path=/; SameSite=Lax",
    );
    const exit = await call("DELETE");
    expect(exit.status).toBe(204);
    expect(exit.headers.get("set-cookie")).toMatch(/^tenon-preview=; Max-Age=0/);
  });

  it("rejects an unknown perspective", async () => {
    await s.client.signUp(admin);
    const res = await s.fetch(`${origin}/_tenon/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ perspective: "all" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: expect.any(String) });
  });

  it("needs a session to set the cookie", async () => {
    const res = await s.fetch(`${origin}/_tenon/preview`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("withSession", () => {
  const request = (cookie?: string) =>
    new Request(origin, { headers: cookie ? { cookie } : undefined });
  async function session() {
    const res = await cms.fetch(
      new Request(`${origin}/_tenon/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify(admin),
      }),
    );
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  beforeEach(() => unpublished(ids.p.id, { title: "Draft" }));

  it("reads published content without a preview cookie", async () => {
    expect(await (await cms.withSession(request())).find("posts")).toEqual([]);
    const cookie = await session();
    expect(await (await cms.withSession(request(cookie))).find("posts")).toEqual([]);
  });

  it("reads drafts with a preview cookie and a session", async () => {
    expect(await (await cms.withSession(request("tenon-preview=drafts"))).find("posts")).toEqual(
      [],
    );
    const cookie = await session();
    const api = await cms.withSession(request(`${cookie}; tenon-preview=drafts`));
    expect(await api.find("posts")).toHaveLength(1);
  });

  it("reads published content with the published perspective", async () => {
    const cookie = await session();
    const api = await cms.withSession(request(`${cookie}; tenon-preview=published`));
    expect(await api.find("posts")).toEqual([]);
  });

  it("binds the session user", async () => {
    const users: unknown[] = [];
    const hooked = relational(db.database);
    (hooked.schema.collections!.tags as { hooks?: object }).hooks = {
      beforeRead: [
        ({ docs, user }: any) => {
          users.push(user?.email ?? null);
          return docs;
        },
      ],
    } as never;
    const cookie = await session();
    await (await hooked.withSession(request(cookie))).find("tags");
    await (await hooked.withSession(request())).find("tags");
    await (await hooked.withSession(request(cookie))).withDrafts().find("tags");
    expect(users).toEqual([admin.email, null, admin.email]);
  });
});

describe("session user of HTTP reads", () => {
  it("is passed to read hooks, in both perspectives", async () => {
    const users: unknown[] = [];
    const hooked = relational(db.database);
    (hooked.schema.collections!.tags as { hooks?: object }).hooks = {
      beforeRead: [
        ({ docs, user }: any) => {
          users.push(user?.email ?? null);
          return docs;
        },
      ],
    } as never;
    const s = setup(hooked);
    await s.client.find("tags");
    await s.client.signUp(admin);
    await s.client.find("tags");
    await s.client.preview.enter();
    await s.client.find("tags");
    expect(users).toEqual([null, admin.email, admin.email]);
  });
});

describe("draft writes", () => {
  // `stage:draft` for every write hook call, in order.
  let calls: string[];
  // `previousDoc` of each `afterChange` call on `posts`.
  let previous: unknown[];
  const record =
    (stage: string) =>
    ({ draft }: { draft: boolean }) => {
      calls.push(`${stage}:${draft}`);
    };
  const make = () =>
    defineCms({
      collections: {
        posts: {
          fields: {
            title: { type: "text", required: true },
            slug: { type: "text", unique: true },
            views: { type: "number" },
          },
          hooks: {
            beforeValidate: [record("beforeValidate")],
            beforeChange: [record("beforeChange")],
            afterChange: [
              record("afterChange"),
              ({ previousDoc }: { previousDoc?: unknown }) => {
                previous.push(previousDoc);
              },
            ],
          },
        },
        pages: {
          fields: page().fields,
          hooks: page().hooks,
        },
        notes: {
          fields: { post: { type: "relation", collection: "posts", onDelete: "set-null" } },
        },
        logs: { drafts: false, fields: { text: { type: "text" } } },
      },
      globals: {
        site: { fields: { name: { type: "text", required: true } } },
        flags: { drafts: false, fields: { on: { type: "boolean" } } },
      },
      media: false,
      settings: false,
      database: testDatabase(),
      secret: "x".repeat(32),
    });
  let cms: ReturnType<typeof make>;
  beforeEach(() => {
    calls = [];
    previous = [];
    cms = make();
  });
  const errors = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (e: unknown) => (e instanceof ValidationError ? e.errors : e),
    );

  it("creates a draft that only the drafts perspective reads", async () => {
    const doc = await cms.create("posts", { title: "Draft" }, { draft: true });
    expect(doc).toMatchObject({ title: "Draft", publishedAt: null, hasDraft: true });
    expect(await cms.find("posts")).toEqual([]);
    expect(await cms.withDrafts().findById("posts", doc.id)).toMatchObject({ title: "Draft" });
  });

  it("keeps the published data on a draft update", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    const draft = await cms.update("posts", doc.id, { title: "Next" }, { draft: true });
    expect(draft).toMatchObject({ title: "Next", hasDraft: true, publishedAt: doc.publishedAt });
    expect(await cms.findById("posts", doc.id)).toMatchObject({ title: "Live", hasDraft: true });
  });

  it("updates the draft of a document that was never published", async () => {
    const doc = await cms.create("posts", { title: "One" }, { draft: true });
    expect(await cms.update("posts", doc.id, { views: 2 }, { draft: true })).toMatchObject({
      title: "One",
      views: 2,
    });
  });

  it("skips required and unique, but checks types", async () => {
    await cms.create("posts", { title: "A", slug: "a" });
    expect(await cms.create("posts", { slug: "a" }, { draft: true })).toMatchObject({ slug: "a" });
    expect(await errors(cms.create("posts", { views: "many" }, { draft: true }))).toHaveProperty(
      "views",
    );
  });

  it("passes draft to hooks and runs afterChange only on publish", async () => {
    const doc = await cms.create("posts", { title: "A" }, { draft: true });
    expect(calls).toEqual(["beforeValidate:true", "beforeChange:true"]);
    calls = [];
    await cms.publish("posts", doc.id);
    expect(calls).toEqual(["beforeValidate:false", "beforeChange:false", "afterChange:false"]);
  });

  it("runs beforeChange on drafts", async () => {
    const doc = await cms.create("pages", { title: "About", slug: "about" }, { draft: true });
    expect(doc).toMatchObject({ path: "/about" });
  });

  it("publishes the draft", async () => {
    const doc = await cms.create("posts", { title: "A" }, { draft: true });
    const published = await cms.publish("posts", doc.id);
    expect(published).toMatchObject({
      title: "A",
      hasDraft: false,
      publishedAt: expect.any(String),
    });
    expect(await cms.findById("posts", doc.id)).toMatchObject({ title: "A", hasDraft: false });
  });

  it("passes the published document as previousDoc on publish", async () => {
    const draft = await cms.create("posts", { title: "A" }, { draft: true });
    await cms.publish("posts", draft.id);
    expect(previous).toEqual([undefined]);
    const live = await cms.create("posts", { title: "Live" });
    await cms.update("posts", live.id, { title: "Next" }, { draft: true });
    previous = [];
    await cms.publish("posts", live.id);
    expect(previous).toEqual([expect.objectContaining({ title: "Live" })]);
  });

  it("updates child paths when a draft slug change is published", async () => {
    const about = await cms.create("pages", { title: "About", slug: "about" });
    const child = await cms.create("pages", { title: "Jobs", slug: "jobs", parent: about.id });
    await cms.update("pages", about.id, { slug: "team" }, { draft: true });
    await cms.publish("pages", about.id);
    expect(await cms.findById("pages", child.id)).toMatchObject({ path: "/team/jobs" });
  });

  it("merges a plain write in a drafts scope over the published data", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    await cms.update("posts", doc.id, { title: "Next" }, { draft: true });
    await cms.withDrafts().update("posts", doc.id, { views: 3 });
    expect(await cms.findById("posts", doc.id)).toMatchObject({
      title: "Live",
      views: 3,
      hasDraft: true,
    });
    expect(await cms.withDrafts().findById("posts", doc.id)).toMatchObject({ title: "Next" });
  });

  it("publishes without a draft", async () => {
    const doc = await cms.create("posts", { title: "A" });
    expect(await cms.publish("posts", doc.id)).toMatchObject({ title: "A", hasDraft: false });
  });

  it("validates on publish and keeps the draft", async () => {
    const doc = await cms.create("posts", { views: 1 }, { draft: true });
    expect(await errors(cms.publish("posts", doc.id))).toHaveProperty("title");
    expect(await cms.withDrafts().findById("posts", doc.id)).toMatchObject({
      views: 1,
      publishedAt: null,
      hasDraft: true,
    });
  });

  it("checks unique on publish", async () => {
    await cms.create("posts", { title: "A", slug: "a" });
    const doc = await cms.create("posts", { title: "B", slug: "a" }, { draft: true });
    expect(await errors(cms.publish("posts", doc.id))).toHaveProperty("slug");
  });

  it("discards the draft", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    await cms.update("posts", doc.id, { title: "Next" }, { draft: true });
    expect(await cms.discard("posts", doc.id)).toMatchObject({ title: "Live", hasDraft: false });
    expect(await cms.withDrafts().findById("posts", doc.id)).toMatchObject({ title: "Live" });
  });

  it("deletes a document that was never published on discard", async () => {
    const post = await cms.create("posts", { title: "A" }, { draft: true });
    const note = await cms.create("notes", { post: post.id });
    expect(await cms.discard("posts", post.id)).toBeUndefined();
    expect(await cms.withDrafts().findById("posts", post.id)).toBeUndefined();
    expect(await cms.findById("notes", note.id, { populate: false })).toMatchObject({
      post: null,
    });
  });

  it("rejects drafts where they are off", async () => {
    const message = { "": 'Drafts are off for "logs"' };
    expect(await errors(cms.create("logs", {}, { draft: true }))).toEqual(message);
    const log = await cms.create("logs", { text: "a" });
    expect(await errors(cms.update("logs", log.id, {}, { draft: true }))).toEqual(message);
    expect(await errors(cms.discard("logs", log.id))).toEqual(message);
    const flags = { "": 'Drafts are off for "flags"' };
    expect(await errors(cms.setGlobal("flags", {}, { draft: true }))).toEqual(flags);
    expect(await errors(cms.discardGlobal("flags"))).toEqual(flags);
  });

  it("drafts, publishes and discards globals", async () => {
    expect(await cms.setGlobal("site", {}, { draft: true })).toMatchObject({
      publishedAt: null,
      hasDraft: true,
    });
    expect(await errors(cms.publishGlobal("site"))).toHaveProperty("name");
    await cms.setGlobal("site", { name: "Next" }, { draft: true });
    expect(await cms.getGlobal("site")).toEqual({ publishedAt: null, hasDraft: false });
    expect(await cms.publishGlobal("site")).toMatchObject({ name: "Next" });
    expect(await cms.getGlobal("site")).toMatchObject({ name: "Next", hasDraft: false });
    await cms.setGlobal("site", { name: "Later" }, { draft: true });
    expect(await cms.discardGlobal("site")).toMatchObject({ name: "Next", hasDraft: false });
    expect(await cms.withDrafts().getGlobal("site")).toMatchObject({ name: "Next" });
  });

  it("sends drafts in the schema", async () => {
    const { client } = setup(cms);
    await client.signUp(admin);
    const schema = await client.getSchema();
    expect(schema.collections?.logs?.drafts).toBe(false);
  });

  describe("over HTTP", () => {
    let s: ReturnType<typeof setup<typeof cms>>;
    const call = (method: string, path: string, body?: object) =>
      s.fetch(`${origin}/_tenon${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body && JSON.stringify(body),
      });
    beforeEach(() => {
      s = setup(cms);
    });

    it("needs a session", async () => {
      expect((await call("POST", "/collections/posts/draft", { title: "A" })).status).toBe(401);
      expect((await call("POST", "/collections/posts/x/publish")).status).toBe(401);
      expect((await call("PUT", "/globals/site/draft", {})).status).toBe(401);
    });

    it("has routes for draft, publish and discard", async () => {
      await s.client.signUp(admin);
      const created = await call("POST", "/collections/posts/draft", { views: 1 });
      expect(created.status).toBe(201);
      const { id } = await created.json();
      const path = `/collections/posts/${id}`;
      expect((await call("PUT", `${path}/draft`, { views: "x" })).status).toBe(400);
      expect((await call("POST", `${path}/publish`)).status).toBe(400);
      expect((await call("PUT", `${path}/draft`, { title: "A" })).status).toBe(200);
      expect(await (await call("POST", `${path}/publish`)).json()).toMatchObject({ title: "A" });
      await call("PUT", `${path}/draft`, { title: "B" });
      const discarded = await call("DELETE", `${path}/draft`);
      expect(await discarded.json()).toMatchObject({ title: "A", hasDraft: false });
      expect((await call("PUT", `/collections/posts/missing/draft`, {})).status).toBe(404);
      const other = await (await call("POST", "/collections/posts/draft", {})).json();
      expect((await call("DELETE", `/collections/posts/${other.id}/draft`)).status).toBe(204);
      expect((await call("PUT", "/globals/site/draft", { name: "S" })).status).toBe(200);
      expect(await (await call("POST", "/globals/site/publish")).json()).toMatchObject({
        name: "S",
      });
      await call("PUT", "/globals/site/draft", { name: "T" });
      expect(await (await call("DELETE", "/globals/site/draft")).json()).toMatchObject({
        name: "S",
      });
    });

    it("has client methods", async () => {
      const { client } = s;
      await client.signUp(admin);
      const doc = await client.createDraft("posts", { views: 1 });
      expect(doc).toMatchObject({ views: 1, hasDraft: true });
      await client.updateDraft("posts", doc.id, { title: "A" });
      expect(await client.publish("posts", doc.id)).toMatchObject({ title: "A" });
      await client.updateDraft("posts", doc.id, { title: "B" });
      expect(await client.discard("posts", doc.id)).toMatchObject({ title: "A" });
      const other = await client.createDraft("posts", {});
      expect(await client.discard("posts", other.id)).toBeNull();
      await client.setGlobalDraft("site", { name: "S" });
      expect(await client.publishGlobal("site")).toMatchObject({ name: "S" });
      await client.setGlobalDraft("site", { name: "T" });
      expect(await client.discardGlobal("site")).toMatchObject({ name: "S" });
    });
  });
});

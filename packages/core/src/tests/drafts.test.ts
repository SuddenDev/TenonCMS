import { createClient as createLibsql } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { admin, origin, relational, seed, setup, tmpDb } from "./setup.ts";

let url: string;
let cms: ReturnType<typeof relational>;
let ids: Awaited<ReturnType<typeof seed>>;
beforeEach(async () => {
  url = tmpDb();
  cms = relational(url);
  ids = await seed(cms);
});

// The draft write API comes later, so these tests write drafts through SQL.
async function sql(statement: string, args: unknown[]) {
  const db = createLibsql({ url });
  try {
    await db.execute({ sql: statement, args: args as never[] });
  } finally {
    db.close();
  }
}
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
    const doc = await cms.drafts().findById("posts", ids.p.id);
    expect(doc).toMatchObject({
      title: "Draft",
      publishedAt: null,
      hasDraft: true,
      author: { name: "Draft Ann" },
    });
    expect(await cms.drafts().find("posts")).toHaveLength(1);
  });

  it("filters on draft data", async () => {
    await draft(ids.t1.id, { name: "uno" });
    expect(await cms.drafts().find("tags", { where: { name: "uno" } })).toHaveLength(1);
    expect(await cms.drafts().find("tags", { where: { name: "one" } })).toEqual([]);
  });

  it("populates joins from drafts", async () => {
    await draft(ids.p.id, { title: "Hi", tags: [ids.t2.id] });
    const read = (api: typeof cms) =>
      api.findById("tags", ids.t1.id, { populate: { posts: true } });
    expect((await read(cms))?.posts).toHaveLength(1);
    expect((await read(cms.drafts()))?.posts).toEqual([]);
  });

  it("reads global drafts", async () => {
    await cms.setGlobal("site", { featured: [ids.p.id] });
    await sql(`UPDATE cms_globals SET draft = ? WHERE name = 'site'`, ['{"featured":[]}']);
    expect(await cms.getGlobal("site", { populate: false })).toMatchObject({
      featured: [ids.p.id],
      hasDraft: true,
    });
    expect(await cms.drafts().getGlobal("site", { populate: false })).toMatchObject({
      featured: [],
    });
  });

  it("is passed to hooks", async () => {
    const seen: unknown[] = [];
    const hooked = relational(url);
    // Hooks on the instance's own schema object, which core reads.
    (hooked.schema.collections!.tags as { hooks?: object }).hooks = {
      afterRead: [
        async ({ docs, cms }: any) => {
          seen.push((await cms.find("posts")).length);
          return docs;
        },
      ],
    } as never;
    await unpublished(ids.p.id, { title: "Draft" });
    await hooked.find("tags");
    await hooked.drafts().find("tags");
    expect(seen).toEqual([0, 1]);
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
    await s.client.preview.exit();
    expect(await titles()).toEqual([]);
  });

  it("ignores the cookie without a session", async () => {
    const res = await cms.fetch(
      new Request(`${origin}/api/cms/collections/posts`, {
        headers: { cookie: "integral-preview=1" },
      }),
    );
    expect(await res.json()).toEqual([]);
  });

  it("sets and clears the cookie", async () => {
    await s.client.signUp(admin);
    const call = (method: string) =>
      s.fetch(`${origin}/api/cms/preview`, {
        method,
        headers: { "content-type": "application/json" },
      });
    const enter = await call("POST");
    expect(enter.status).toBe(204);
    expect(enter.headers.get("set-cookie")).toMatch(
      /^integral-preview=1; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    const exit = await call("DELETE");
    expect(exit.status).toBe(204);
    expect(exit.headers.get("set-cookie")).toMatch(/^integral-preview=; Max-Age=0/);
  });

  it("needs a session to set the cookie", async () => {
    const res = await s.fetch(`${origin}/api/cms/preview`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("forRequest", () => {
  const request = (cookie?: string) =>
    new Request(origin, { headers: cookie ? { cookie } : undefined });
  async function session() {
    const res = await cms.fetch(
      new Request(`${origin}/api/cms/auth/sign-up/email`, {
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
    expect(await (await cms.forRequest(request())).find("posts")).toEqual([]);
    const cookie = await session();
    expect(await (await cms.forRequest(request(cookie))).find("posts")).toEqual([]);
  });

  it("reads drafts with a preview cookie and a session", async () => {
    expect(await (await cms.forRequest(request("integral-preview=1"))).find("posts")).toEqual([]);
    const cookie = await session();
    const api = await cms.forRequest(request(`${cookie}; integral-preview=1`));
    expect(await api.find("posts")).toHaveLength(1);
  });

  it("binds the session user", async () => {
    const users: unknown[] = [];
    const hooked = relational(url);
    (hooked.schema.collections!.tags as { hooks?: object }).hooks = {
      beforeRead: [
        ({ docs, user }: any) => {
          users.push(user?.email ?? null);
          return docs;
        },
      ],
    } as never;
    const cookie = await session();
    await (await hooked.forRequest(request(cookie))).find("tags");
    await (await hooked.forRequest(request())).find("tags");
    expect(users).toEqual([admin.email, null]);
  });
});

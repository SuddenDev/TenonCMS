import { createClient as createLibsql } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { seo } from "../presets/index.ts";
import { fresh, origin, relational, seed, setup, status, tmpDb, type Env } from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("populate", () => {
  let cms: ReturnType<typeof relational>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    cms = relational();
    ids = await seed(cms);
  });

  it("resolves relations up to the default depth", async () => {
    const { a, m } = ids;
    expect((await cms.find("posts"))[0]).toMatchObject({
      author: { id: a.id, name: "Ann", avatar: { id: m.id, url: "/a.png" } },
      tags: [{ name: "one" }, { name: "two" }],
      seo: { image: { url: "/a.png" } },
    });
  });

  it("returns ids with populate: false", async () => {
    const { a, m, t1, t2 } = ids;
    expect((await cms.find("posts", { populate: false }))[0]).toMatchObject({
      author: a.id,
      tags: [t1.id, t2.id],
      seo: { image: m.id },
    });
  });

  it("resolves a missing target to null and drops it from many", async () => {
    const url = tmpDb();
    const cms = relational(url);
    const { a, t2 } = await seed(cms);
    const db = createLibsql({ url });
    await db.execute({ sql: "DELETE FROM cms_documents WHERE id IN (?, ?)", args: [a.id, t2.id] });
    db.close();
    const post = (await cms.find("posts"))[0];
    expect(post.author).toBeNull();
    expect(post.tags).toMatchObject([{ name: "one" }]);
  });

  it("limits hops with depth", async () => {
    const { a, m } = ids;
    expect((await cms.find("posts", { depth: 1 }))[0].author?.avatar).toBe(m.id);
    expect((await cms.find("posts", { depth: 0 }))[0].author).toBe(a.id);
  });

  it("ends cycles at the depth limit", async () => {
    const x = await cms.create("pages", { title: "x" });
    const y = await cms.create("pages", { title: "y", parent: x.id });
    await cms.update("pages", x.id, { title: "x", parent: y.id });
    const doc = await cms.findById("pages", x.id, { depth: 3 });
    expect(doc?.parent?.id).toBe(y.id);
    expect(doc?.parent?.parent?.id).toBe(x.id);
    expect(doc?.parent?.parent?.parent?.id).toBe(y.id);
    expect(doc?.parent?.parent?.parent?.parent).toBe(x.id);
  });

  it("uses the config depth", async () => {
    const cms = relational(":memory:", { depth: 1 });
    const { m } = await seed(cms);
    expect((await cms.find("posts"))[0].author).toMatchObject({ avatar: m.id });
  });

  it("resolves only listed paths", async () => {
    const { m, t1, t2 } = ids;
    const post = (await cms.find("posts", { populate: { author: { avatar: true } } }))[0];
    expect(post.author?.avatar?.url).toBe("/a.png");
    expect(post.tags).toEqual([t1.id, t2.id]);
    expect(post.seo?.image).toBe(m.id);
  });

  it("resolves through groups", async () => {
    expect(
      (await cms.find("posts", { populate: { seo: { image: true } } }))[0].seo?.image?.url,
    ).toBe("/a.png");
    expect((await cms.find("posts", { populate: { seo: true } }))[0].seo?.image?.url).toBe(
      "/a.png",
    );
  });

  it("ignores depth with an object", async () => {
    expect(
      (await cms.find("posts", { populate: { author: true }, depth: 5 }))[0].author?.avatar,
    ).toBe(ids.m.id);
  });

  it("resolves a named join newest first", async () => {
    const { a, p } = ids;
    const p2 = await cms.create("posts", { title: "Two", author: a.id });
    const author = await cms.findById("authors", a.id, { populate: { posts: true } });
    expect(author?.posts.map((x) => x.id)).toEqual([p2.id, p.id]);
    expect(author?.posts[0].author).toBe(a.id);
  });

  it("leaves unnamed joins out", async () => {
    expect(await cms.findById("authors", ids.a.id)).not.toHaveProperty("posts");
  });

  it("joins over many relations and groups", async () => {
    const { m, t2, p } = ids;
    expect(
      (await cms.findById("tags", t2.id, { populate: { posts: true } }))?.posts.map((x) => x.id),
    ).toEqual([p.id]);
    expect(
      (await cms.findById("media", m.id, { populate: { usedIn: true } }))?.usedIn.map((x) => x.id),
    ).toEqual([p.id]);
    const b = await cms.create("authors", { name: "Bo" });
    expect((await cms.findById("authors", b.id, { populate: { posts: true } }))?.posts).toEqual([]);
  });

  it("nested paths go through a join", async () => {
    expect(
      (await cms.findById("authors", ids.a.id, { populate: { posts: { tags: true } } }))?.posts[0]
        .tags?.[0].name,
    ).toBe("one");
  });

  it("resolves global relations", async () => {
    const { m, p } = ids;
    await cms.setGlobal("site", { logo: m.id, featured: [p.id] });
    const site = await cms.getGlobal("site");
    expect(site.logo?.url).toBe("/a.png");
    expect(site.featured?.[0].author?.name).toBe("Ann");
    expect(await cms.getGlobal("site", { populate: false })).toEqual({
      logo: m.id,
      featured: [p.id],
    });
  });

  it("findById and findOne populate too", async () => {
    const { a, p } = ids;
    expect(await cms.findById("posts", p.id)).toMatchObject({ author: { id: a.id, name: "Ann" } });
    expect(await cms.findOne("posts", { where: { title: "Hi" } })).toMatchObject({
      author: { id: a.id, name: "Ann" },
    });
  });
});

describe("select", () => {
  let cms: ReturnType<typeof relational>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    cms = relational();
    ids = await seed(cms);
  });

  it("returns id and the selected fields from every read method", async () => {
    const { p } = ids;
    const expected = { id: p.id, title: "Hi", author: { id: ids.a.id, name: "Ann" } };
    const select = { title: true, author: { name: true } } as const;
    expect(await cms.find("posts", { select })).toEqual([expected]);
    expect(await cms.findOne("posts", { where: { title: "Hi" }, select })).toEqual(expected);
    expect(await cms.findById("posts", p.id, { select })).toEqual(expected);
    expect(await cms.findById("posts", p.id, { select: {} })).toEqual({ id: p.id });
    expect(await cms.findById("posts", p.id, { select: { createdAt: true } })).toEqual({
      id: p.id,
      createdAt: p.createdAt,
    });
  });

  it("selects inside a global and through a join", async () => {
    const { m, p, a } = ids;
    await cms.setGlobal("site", { logo: m.id, featured: [p.id] });
    expect(await cms.getGlobal("site", { select: { featured: { title: true } } })).toEqual({
      featured: [{ id: p.id, title: "Hi" }],
    });
    expect(
      await cms.findById("authors", a.id, {
        populate: { posts: true },
        select: { posts: { title: true } },
      }),
    ).toEqual({
      id: a.id,
      posts: [{ id: p.id, title: "Hi" }],
    });
  });

  it("rejects an unknown key, a nested object on a plain field and an unresolved relation", async () => {
    await expect(cms.find("posts", { select: { titel: true } } as never)).rejects.toThrow(
      "Invalid select: titel",
    );
    await expect(cms.find("posts", { select: { title: { x: true } } } as never)).rejects.toThrow(
      "Invalid select: title",
    );
    await expect(
      cms.find("posts", { populate: false, select: { author: { name: true } } } as never),
    ).rejects.toThrow("Invalid select: author");
    await expect(cms.getGlobal("site", { select: { nope: true } } as never)).rejects.toThrow(
      "Invalid select: nope",
    );
  });

  it("runs after afterRead and before afterOperation", async () => {
    const seen: string[][] = [];
    const keys = (d: object) => Object.keys(d).sort();
    const cms = defineCms({
      collections: {
        posts: {
          fields: { title: { type: "text" }, body: { type: "text" } },
          hooks: {
            afterRead: [
              ({ docs, operation }) => void (operation === "read" && seen.push(keys(docs[0]))),
            ],
            afterOperation: [
              ({ result, operation }) =>
                void (operation === "read" && seen.push(keys((result as object[])[0]))),
            ],
          },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    await cms.create("posts", { title: "a", body: "b" });
    await cms.find("posts", { select: { title: true } });
    expect(seen).toEqual([
      ["body", "createdAt", "id", "title", "updatedAt"],
      ["id", "title"],
    ]);
  });
});

describe("populate over HTTP", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });
  const get = async (path: string) => {
    const res = await r.cms.fetch(new Request(`${origin}/api/cms${path}`));
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  it("resolves relations by default", async () => {
    expect((await get("/collections/posts")).body[0].author.name).toBe("Ann");
  });

  it("reads populate and depth from the query", async () => {
    const { a, m, p } = ids;
    expect((await get("/collections/posts?populate=false")).body[0].author).toBe(a.id);
    expect((await get("/collections/posts?depth=1")).body[0].author.avatar).toBe(m.id);
    for (const q of ["seo.image", "seo"]) {
      const post = (await get(`/collections/posts?populate=${q}`)).body[0];
      expect(post.seo.image.url).toBe("/a.png");
      expect(post.author).toBe(a.id);
    }
    expect((await get(`/collections/authors/${a.id}?populate=posts`)).body.posts[0].id).toBe(p.id);
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await get("/globals/site?populate=false")).body).toEqual({ logo: m.id });
    expect((await get("/collections/posts?populate=false&title=Hi")).body).toHaveLength(1);
    expect((await get("/collections/posts?populate=false&title=No")).body).toHaveLength(0);
  });

  it("populates through the client", async () => {
    const { client } = r;
    const { a, m, p } = ids;
    expect(
      (await client.find("posts", { populate: { author: { avatar: true } } }))[0].author?.avatar
        ?.url,
    ).toBe("/a.png");
    expect((await client.findById("posts", p.id, { populate: false })).author).toBe(a.id);
    expect((await client.find("posts", { populate: {} }))[0].author).toBe(a.id);
    expect(
      (await client.findOne("posts", { where: { title: "Hi" }, populate: false }))?.author,
    ).toBe(a.id);
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await client.getGlobal("site", { depth: 0 })).logo).toBe(m.id);
    expect((await client.getGlobal("site")).logo?.url).toBe("/a.png");
  });

  it("types client reads", () => {
    async () => {
      const { client } = r;
      const s = await client.findById("posts", "x", {
        select: { title: true, author: { name: true } },
      });
      s.title satisfies string;
      s.author?.name satisfies string | undefined;
      // @ts-expect-error not selected
      s.tags;
      // @ts-expect-error unresolved relation
      client.find("posts", { populate: false, select: { author: { name: true } } });
      // @ts-expect-error unknown key
      client.getGlobal("site", { select: { nope: true } });
      const c = (await client.find("posts"))[0];
      const n: string = c.author!.name;
      // @ts-expect-error unknown populate key
      client.find("posts", { populate: { autor: true } });
      const ids = await client.findById("posts", "x", { populate: false });
      const aid: string | null | undefined = ids.author;
      const j = await client.findById("authors", "x", { populate: { posts: true } });
      const t: string = j.posts[0].title;
    };
  });

  it.each([
    ["?depth=6", "Invalid depth: 6"],
    ["?populate=title", "Invalid populate: title"],
    ["?populate=nope", "Invalid populate: nope"],
    [
      "?populate=author.posts.author.posts.author.posts",
      "Invalid populate: author.posts.author.posts.author.posts",
    ],
  ])("rejects %s", async (q, message) => {
    expect(await get(`/collections/posts${q}`)).toEqual({ status: 400, body: { message } });
    expect(await get(`/collections/posts/${ids.p.id}${q}`)).toEqual({
      status: 400,
      body: { message },
    });
    expect((await get(`/globals/site${q.replace("title", "nope")}`)).status).toBe(400);
  });
});

describe("select over HTTP", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });
  const get = async (path: string) => {
    const res = await r.cms.fetch(new Request(`${origin}/api/cms${path}`));
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  it("returns only the selected fields", async () => {
    const { p, a, m } = ids;
    const expected = { id: p.id, title: "Hi", author: { id: a.id, name: "Ann" } };
    expect((await get("/collections/posts?select=title,author.name")).body).toEqual([expected]);
    expect((await get(`/collections/posts/${p.id}?select=title,author.name`)).body).toEqual(
      expected,
    );
    expect((await get(`/collections/posts/${p.id}?select=`)).body).toEqual({ id: p.id });
    expect((await get(`/collections/posts/${p.id}?select=seo,seo.image.url`)).body).toEqual({
      id: p.id,
      seo: { image: { id: m.id, url: "/a.png" } },
    });
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await get("/globals/site?select=logo.url")).body).toEqual({
      logo: { id: m.id, url: "/a.png" },
    });
  });

  it("selects through the client", async () => {
    const { client } = r;
    const { p, a, m } = ids;
    expect(
      await client.findById("posts", p.id, { select: { title: true, author: { name: true } } }),
    ).toEqual({
      id: p.id,
      title: "Hi",
      author: { id: a.id, name: "Ann" },
    });
    expect((await client.find("posts", { select: {} }))[0]).toEqual({ id: p.id });
    expect(
      await client.findOne("posts", {
        where: { title: "Hi" },
        populate: false,
        select: { author: true },
      }),
    ).toEqual({ id: p.id, author: a.id });
    await r.cms.setGlobal("site", { logo: m.id });
    expect(await client.getGlobal("site", { select: { logo: { url: true } } })).toEqual({
      logo: { id: m.id, url: "/a.png" },
    });
  });

  it("rejects meta keys where they do not exist", async () => {
    const { p } = ids;
    expect(await get(`/collections/posts/${p.id}?select=seo.id`)).toEqual({
      status: 400,
      body: { message: "Invalid select: seo.id" },
    });
    expect(await get("/globals/site?select=createdAt")).toEqual({
      status: 400,
      body: { message: "Invalid select: createdAt" },
    });
    await expect(r.cms.getGlobal("site", { select: { id: true } } as never)).rejects.toThrow(
      "Invalid select: id",
    );
  });

  it("rejects prototype keys without touching Object.prototype", async () => {
    for (const q of ["__proto__.polluted", "constructor.prototype.polluted", "__proto__"]) {
      expect(await get(`/collections/posts?select=${q}`)).toEqual({
        status: 400,
        body: { message: expect.stringMatching(/^Invalid select: /) },
      });
      expect((await get(`/collections/posts?populate=${q}`)).status).toBe(400);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("is a reserved param, not a filter", async () => {
    expect((await get("/collections/posts?select=title&title=Hi")).body).toHaveLength(1);
    expect((await get("/collections/posts?select=title&title=No")).body).toHaveLength(0);
  });

  it.each([
    ["?select=titel", "titel"],
    ["?select=title.x", "title"],
    ["?select=author.nope", "author.nope"],
    ["?populate=false&select=author.name", "author"],
    ["?depth=1&select=author.avatar.url", "author.avatar"],
    ["?populate=tags&select=author.name", "author"],
  ])("rejects %s", async (q, path) => {
    const body = { message: `Invalid select: ${path}` };
    expect(await get(`/collections/posts${q}`)).toEqual({ status: 400, body });
    expect(await get(`/collections/posts/${ids.p.id}${q}`)).toEqual({ status: 400, body });
  });

  it("rejects an unknown key on a global", async () => {
    expect(await get("/globals/site?select=nope")).toEqual({
      status: 400,
      body: { message: "Invalid select: nope" },
    });
  });
});

import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { defineCms } from "../index.ts";
import { modifierId } from "../media/images/modifiers.ts";
import { local } from "../media/storage/local/index.ts";
import type { Modifiers } from "../schema/index.ts";
import type { RelationSelect } from "../schema/fields/relation.ts";
import { png300 } from "./fixtures.ts";
import {
  origin,
  published,
  relational,
  seed,
  setup,
  tmpDir,
  testDatabase,
  testDb,
} from "./setup.ts";

describe("populate", () => {
  let cms: ReturnType<typeof relational>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    cms = relational();
    ids = await seed(cms);
  });

  it("resolves relations up to the default depth, or ids with populate: false", async () => {
    const { a, m, t1, t2 } = ids;
    expect((await cms.find("posts"))[0]).toMatchObject({
      author: { id: a.id, name: "Ann", avatar: { id: m.id, url: "/a.png" } },
      tags: [{ name: "one" }, { name: "two" }],
      seo: { image: { url: "/a.png" } },
    });
    expect((await cms.find("posts", { populate: false }))[0]).toMatchObject({
      author: a.id,
      tags: [t1.id, t2.id],
      seo: { image: m.id },
    });
  });

  it("resolves a missing target to null and drops it from many", async () => {
    const { database, exec } = testDb();
    const cms = relational(database);
    const { a, t2 } = await seed(cms);
    await exec("DELETE FROM cms_documents WHERE id IN (?, ?)", [a.id, t2.id]);
    const post = (await cms.find("posts"))[0];
    expect(post.author).toBeNull();
    expect(post.tags).toMatchObject([{ name: "one" }]);
  });

  it("limits hops with depth, the config depth and nothing else", async () => {
    const { a, m } = ids;
    expect((await cms.find("posts", { depth: 1 }))[0].author?.avatar).toBe(m.id);
    expect((await cms.find("posts", { depth: 0 }))[0].author).toBe(a.id);
    const shallow = relational(testDatabase(), { depth: 1 });
    const seeded = await seed(shallow);
    expect((await shallow.find("posts"))[0].author).toMatchObject({ avatar: seeded.m.id });
  });

  it("ends cycles at the depth limit", async () => {
    const x = await cms.create("pages", { title: "x" });
    const y = await cms.create("pages", { title: "y", parent: x.id });
    await cms.update("pages", x.id, { title: "x", parent: y.id });
    const doc = await cms.findById("pages", x.id, { depth: 3 });
    expect(doc?.parent?.parent?.parent?.id).toBe(y.id);
    expect(doc?.parent?.parent?.parent?.parent).toBe(x.id);
  });

  it("resolves only listed paths and ignores depth with an object", async () => {
    const { m, t1, t2 } = ids;
    const post = (await cms.find("posts", { populate: { author: { avatar: true } }, depth: 0 }))[0];
    expect(post.author?.avatar?.url).toBe("/a.png");
    expect(post.tags).toEqual([t1.id, t2.id]);
    expect(post.seo?.image).toBe(m.id);
    expect(
      (await cms.find("posts", { populate: { seo: { image: true } } }))[0].seo?.image?.url,
    ).toBe("/a.png");
  });

  it("resolves a named join newest first and leaves unnamed joins out", async () => {
    const { a, p } = ids;
    const p2 = await cms.create("posts", { title: "Two", author: a.id });
    const author = await cms.findById("authors", a.id, { populate: { posts: true } });
    expect(author?.posts.map((x) => x.id)).toEqual([p2.id, p.id]);
    expect(author?.posts[0].author).toBe(a.id);
    expect(await cms.findById("authors", a.id)).not.toHaveProperty("posts");
  });

  it("joins over many relations and groups, and nests through a join", async () => {
    const { m, t2, p, a } = ids;
    expect(
      (await cms.findById("tags", t2.id, { populate: { posts: true } }))?.posts.map((x) => x.id),
    ).toEqual([p.id]);
    expect(
      (await cms.findById("assets", m.id, { populate: { usedIn: true } }))?.usedIn.map((x) => x.id),
    ).toEqual([p.id]);
    const b = await cms.create("authors", { name: "Bo" });
    expect((await cms.findById("authors", b.id, { populate: { posts: true } }))?.posts).toEqual([]);
    expect(
      (await cms.findById("authors", a.id, { populate: { posts: { tags: true } } }))?.posts[0]
        .tags?.[0].name,
    ).toBe("one");
  });

  it("resolves global relations", async () => {
    const { m, p } = ids;
    await cms.setGlobal("site", { logo: m.id, featured: [p.id] });
    const site = await cms.getGlobal("site");
    expect(site.logo?.url).toBe("/a.png");
    expect(site.featured?.[0].author?.name).toBe("Ann");
    expect(await cms.getGlobal("site", { populate: false })).toMatchObject({
      logo: m.id,
      featured: [p.id],
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
    ).toEqual({ id: a.id, posts: [{ id: p.id, title: "Hi" }] });
  });

  it("rejects a bad path in the local API", async () => {
    await expect(
      cms.find("posts", { populate: false, select: { author: { name: true } } } as never),
    ).rejects.toThrow("Invalid select: author");
    await expect(cms.getGlobal("site", { select: { id: true } } as never)).rejects.toThrow(
      "Invalid select: id",
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
      database: testDatabase(),
      secret: "x".repeat(32),
    });
    await cms.create("posts", { title: "a", body: "b" });
    await cms.find("posts", { select: { title: true } });
    expect(seen[0]).toContain("body");
    expect(seen[1]).toEqual(["id", "title"]);
  });
});

describe("default select of a relation", () => {
  const define = <const S extends RelationSelect = { title: true; path: true }>(
    select: S = { title: true, path: true } as never,
  ) =>
    defineCms({
      collections: {
        pages: {
          fields: {
            title: { type: "text" },
            path: { type: "text" },
            body: { type: "text" },
            blocks: {
              type: "blocks",
              blocks: {
                cta: {
                  fields: {
                    label: { type: "text" },
                    link: {
                      type: "group",
                      fields: { page: { type: "relation", collection: "pages", select } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      globals: {
        nav: {
          fields: {
            items: {
              type: "array",
              fields: {
                label: { type: "text" },
                page: { type: "relation", collection: "pages", select: { path: true } },
              },
            },
          },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });

  it("trims a populated relation to its select, in blocks and in a global", async () => {
    const cms = define();
    const home = await cms.create("pages", { title: "Home", path: "/", body: "Long" });
    const cta = { blockType: "cta", label: "Go", link: { page: home.id } } as const;
    const about = await cms.create("pages", { title: "About", path: "/about", blocks: [cta] });
    await cms.setGlobal("nav", { items: [{ label: "Home", page: home.id }] });

    const page = (await cms.findById("pages", about.id))!;
    const block = page.blocks![0]!;
    expect(block).toMatchObject({ label: "Go", link: { page: { title: "Home", path: "/" } } });
    expect(block.link!.page).toEqual({ id: home.id, title: "Home", path: "/" });
    expectTypeOf<keyof NonNullable<NonNullable<typeof block.link>["page"]>>().toEqualTypeOf<
      "id" | "title" | "path"
    >();

    const nav = await cms.getGlobal("nav");
    expect(nav.items![0]!.page).toEqual({ id: home.id, path: "/" });
    expectTypeOf<keyof NonNullable<NonNullable<typeof nav.items>[number]["page"]>>().toEqualTypeOf<
      "id" | "path"
    >();
    expect(await cms.getGlobal("nav", { populate: false })).toMatchObject({
      items: [{ page: home.id }],
    });
  });

  it("gives way to a select that lists the relation's own fields", async () => {
    const cms = define();
    const home = await cms.create("pages", { title: "Home", path: "/", body: "Long" });
    await cms.setGlobal("nav", { items: [{ label: "Home", page: home.id }] });
    const nav = await cms.getGlobal("nav", {
      select: { items: { page: { title: true, body: true } } },
    });
    expect(nav.items![0]!.page).toEqual({ id: home.id, title: "Home", body: "Long" });
    expectTypeOf<keyof NonNullable<NonNullable<typeof nav.items>[number]["page"]>>().toEqualTypeOf<
      "id" | "title" | "body"
    >();
    const whole = await cms.getGlobal("nav", { select: { items: true } });
    expect(whole.items![0]!.page).toEqual({ id: home.id, path: "/" });
  });

  it("rejects a select path the target does not have", () => {
    expect(() => define({ titel: true } as never)).toThrow(/invalid select path "titel"/);
  });
});

describe("populate and select over HTTP", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });
  const get = async (path: string) => {
    const res = await r.cms.fetch(new Request(`${origin}/_tenon${path}`));
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  it("reads populate and depth from the query", async () => {
    const { a, m, p } = ids;
    expect((await get("/collections/posts")).body[0].author.name).toBe("Ann");
    expect((await get("/collections/posts?populate=false")).body[0].author).toBe(a.id);
    expect((await get("/collections/posts?depth=1")).body[0].author.avatar).toBe(m.id);
    const post = (await get(`/collections/posts?populate=seo.image`)).body[0];
    expect(post.seo.image.url).toBe("/a.png");
    expect(post.author).toBe(a.id);
    expect((await get(`/collections/authors/${a.id}?populate=posts`)).body.posts[0].id).toBe(p.id);
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await get("/globals/site?populate=false")).body).toMatchObject({ logo: m.id });
    expect((await get("/collections/posts?populate=false&title=Hi")).body).toHaveLength(1);
    expect((await get("/collections/posts?populate=false&title=No")).body).toHaveLength(0);
  });

  it("returns only the selected fields, and select is not a filter", async () => {
    const { p, a, m } = ids;
    const expected = { id: p.id, title: "Hi", author: { id: a.id, name: "Ann" } };
    expect((await get("/collections/posts?select=title,author.name")).body).toEqual([expected]);
    expect((await get(`/collections/posts/${p.id}?select=title,author.name`)).body).toEqual(
      expected,
    );
    expect((await get(`/collections/posts/${p.id}?select=`)).body).toEqual({ id: p.id });
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await get("/globals/site?select=logo.url")).body).toEqual({
      logo: { id: m.id, url: "/a.png" },
    });
    expect((await get("/collections/posts?select=title&title=No")).body).toHaveLength(0);
  });

  it("populates and selects through the client", async () => {
    const { client } = r;
    const { a, m, p } = ids;
    expect(
      (await client.find("posts", { populate: { author: { avatar: true } } }))[0].author?.avatar
        ?.url,
    ).toBe("/a.png");
    expect((await client.findById("posts", p.id, { populate: false })).author).toBe(a.id);
    expect((await client.find("posts", { populate: {} }))[0].author).toBe(a.id);
    expect(
      await client.findOne("posts", {
        where: { title: "Hi" },
        populate: false,
        select: { author: true },
      }),
    ).toEqual({ id: p.id, author: a.id });
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await client.getGlobal("site", { depth: 0 })).logo).toBe(m.id);
    expect(await client.getGlobal("site", { select: { logo: { url: true } } })).toEqual({
      logo: { id: m.id, url: "/a.png" },
    });
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
    ["?populate=nope", "Invalid populate: nope"],
    ["?select=titel", "Invalid select: titel"],
    ["?depth=1&select=author.avatar.url", "Invalid select: author.avatar"],
  ])("rejects %s on lists, documents and globals", async (q, message) => {
    expect(await get(`/collections/posts${q}`)).toEqual({ status: 400, body: { message } });
    expect(await get(`/collections/posts/${ids.p.id}${q}`)).toEqual({
      status: 400,
      body: { message },
    });
    expect((await get(`/globals/site${q.replace("titel", "nope")}`)).status).toBe(400);
  });

  it("rejects meta keys where they do not exist", async () => {
    expect(await get(`/collections/posts/${ids.p.id}?select=seo.id`)).toMatchObject({
      status: 400,
    });
    expect(await get("/globals/site?select=createdAt")).toMatchObject({ status: 400 });
  });

  it("rejects prototype keys without touching Object.prototype", async () => {
    for (const q of ["__proto__.polluted", "constructor.prototype.polluted", "__proto__"]) {
      expect((await get(`/collections/posts?select=${q}`)).status).toBe(400);
      expect((await get(`/collections/posts?populate=${q}`)).status).toBe(400);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("arrays and blocks", () => {
  const provider = {
    getImage: (src: { key: string }, m: Modifiers) => ({ url: `/img/${modifierId(m)}/${src.key}` }),
  };
  const make = async () => {
    const cms = defineCms({
      collections: {
        pages: { fields: { title: { type: "text", required: true } } },
        menus: {
          fields: {
            links: {
              type: "array",
              fields: {
                label: { type: "text" },
                page: { type: "relation", collection: "pages" },
                icon: { type: "image", image: { sizes: [150], quality: 50 } },
              },
            },
          },
        },
        landing: {
          fields: {
            content: {
              type: "blocks",
              blocks: {
                hero: {
                  fields: {
                    title: { type: "text" },
                    image: { type: "image" },
                    page: { type: "relation", collection: "pages" },
                  },
                },
                link: {
                  fields: {
                    label: { type: "text" },
                    page: { type: "relation", collection: "pages" },
                  },
                },
              },
            },
          },
        },
      },
      media: { storage: local({ dir: tmpDir() }), images: { provider, sizes: [100, 200] } },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
    const image = await cms.media.upload(png300, { filename: "hero.png", mimeType: "image/png" });
    const page = await cms.create("pages", { title: "Docs" });
    const menu = await cms.create("menus", {
      links: [
        { id: "l1", label: "A", page: page.id, icon: image.id },
        { id: "l2", label: "B" },
      ],
    });
    const doc = await cms.create("landing", {
      content: [
        { id: "h", blockType: "hero", title: "Hi", image: image.id, page: page.id },
        { id: "l", blockType: "link", label: "Go", page: page.id },
      ],
    });
    const get = async (path: string) => {
      const res = await cms.fetch(new Request(`${origin}/_tenon${path}`));
      return { status: res.status, body: await res.json() };
    };
    return { cms, image, page, menu, doc, get };
  };

  it("resolves relations and images inside items at the default depth", async () => {
    const { cms, image, page, menu, doc } = await make();
    expect((await cms.findById("menus", menu.id))?.links).toEqual([
      {
        id: "l1",
        label: "A",
        page: expect.objectContaining({ id: page.id, title: "Docs" }),
        icon: expect.objectContaining({
          id: image.id,
          src: "/img/f_webp&q_50&w_150/hero.png",
          srcset: "/img/f_webp&q_50&w_150/hero.png 150w",
        }),
      },
      { id: "l2", label: "B" },
    ]);
    expect((await cms.findById("menus", menu.id, { populate: false }))?.links?.[0]).toMatchObject({
      page: page.id,
      icon: image.id,
    });
    expect((await cms.findById("landing", doc.id))?.content).toMatchObject([
      { image: { id: image.id }, page: { id: page.id, title: "Docs" } },
      { page: { id: page.id } },
    ]);
  });

  it("reads populate and select paths into items over HTTP", async () => {
    const { get, image, page, menu, doc } = await make();
    const populated = (await get(`/collections/menus/${menu.id}?populate=links.page`)).body;
    expect(populated.links[0]).toMatchObject({ page: { id: page.id }, icon: image.id });
    expect((await get(`/collections/menus/${menu.id}?select=links.label`)).body).toEqual({
      id: menu.id,
      links: [
        { id: "l1", label: "A" },
        { id: "l2", label: "B" },
      ],
    });
    expect((await get(`/collections/menus?populate=links.label`)).status).toBe(400);

    const blocks = (await get(`/collections/landing/${doc.id}?populate=content.hero.image`)).body;
    expect(blocks.content).toMatchObject([
      { image: { id: image.id }, page: page.id },
      { page: page.id },
    ]);
    expect((await get(`/collections/landing/${doc.id}?select=content.hero.title`)).body).toEqual({
      id: doc.id,
      content: [
        { id: "h", blockType: "hero", title: "Hi" },
        { id: "l", blockType: "link" },
      ],
    });
    expect((await get(`/collections/landing?select=content.title`)).status).toBe(400);
  });
});

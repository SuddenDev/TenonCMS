import { describe, expect, it } from "vitest";
import { createClient } from "./client.ts";
import { matchCondition } from "./condition.ts";
import { defineCms } from "./index.ts";
import { page } from "./presets/index.ts";
import {
  type Collection,
  type Data,
  defineCollection,
  defineGlobal,
  type Doc,
  type Fields,
} from "./schema.ts";
import { dataSchema } from "./validate.ts";
describe("dataSchema", () => {
  const schema = dataSchema({
    title: { type: "text", required: true },
    body: { type: "textarea" },
    views: { type: "number" },
    featured: { type: "boolean" },
    publishedAt: { type: "date" },
    status: { type: "select", options: ["draft", "published"] },
  });

  it("accepts valid data and strips unknown keys", () => {
    expect(
      schema.parse({
        title: "Hi",
        views: 3,
        featured: true,
        publishedAt: "2026-09-23",
        status: "draft",
        extra: 1,
      }),
    ).toEqual({
      title: "Hi",
      views: 3,
      featured: true,
      publishedAt: "2026-09-23",
      status: "draft",
    });
  });

  it("allows optional fields to be missing or null", () => {
    expect(schema.safeParse({ title: "Hi", body: null, views: null }).success).toBe(true);
  });

  it("rejects a missing or empty required text", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ title: "" }).success).toBe(false);
  });

  it("checks length, pattern and range, but not empty optional values", () => {
    const s = dataSchema({
      slug: { type: "text", minLength: 2, maxLength: 4, pattern: "[a-z]+" },
      n: { type: "number", min: 1, max: 3 },
      body: { type: "textarea", minLength: 5 },
      title: { type: "text", required: true, minLength: 3 },
    });
    expect(s.safeParse({ slug: "abc", n: 2, title: "abc" }).success).toBe(true);
    expect(s.safeParse({ slug: "", n: null, body: "", title: "abc" }).success).toBe(true);
    for (const bad of [
      { slug: "a" },
      { slug: "abcde" },
      { slug: "ab1" },
      { slug: "xab!" },
      { n: 0 },
      { n: 4 },
      { body: "abc" },
      { title: "ab" },
    ])
      expect(s.safeParse({ title: "abc", ...bad }).success, JSON.stringify(bad)).toBe(false);
    expect(s.safeParse({ title: "" }).success).toBe(false);
  });

  it("matches the whole value", () => {
    expect(dataSchema({ x: { type: "text", pattern: "a|b" } }).safeParse({ x: "ab" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid pattern", () => {
    expect(() => dataSchema({ x: { type: "text", pattern: "(" } })).toThrow();
  });

  it("skips required and checks for fields whose condition is false, but keeps type checks", () => {
    const fields = {
      mediaType: { type: "select", options: ["image", "youtube"] },
      url: {
        type: "text",
        required: true,
        pattern: "https://.+",
        condition: { mediaType: "youtube" },
      },
      settings: {
        type: "group",
        fields: {
          mode: { type: "text" },
          extra: { type: "text", required: true, condition: { "/mediaType": "youtube" } },
          local: { type: "text", required: true, condition: { mode: "x" } },
        },
      },
      off: {
        type: "group",
        required: true,
        condition: { mediaType: "youtube" },
        fields: { a: { type: "number", required: true } },
      },
    } as const satisfies Fields;
    const parse = (d: object) => dataSchema(fields, d).safeParse(d);
    expect(parse({ mediaType: "image", settings: {} }).success).toBe(true);
    expect(parse({ mediaType: "image", url: "nope", settings: {} })).toMatchObject({
      success: true,
      data: { url: "nope" },
    });
    expect(parse({ mediaType: "image", url: 5 }).success).toBe(false);
    expect(parse({ mediaType: "image", off: { a: "x" } }).success).toBe(false);
    expect(parse({ mediaType: "image", off: {} }).success).toBe(true);
    expect(parse({ mediaType: "image", settings: { mode: "x" } }).success).toBe(false);
    expect(
      parse({ mediaType: "youtube", url: "nope", settings: { extra: "x" }, off: { a: 1 } }).success,
    ).toBe(false);
    expect(
      parse({ mediaType: "youtube", url: "https://y.t", settings: {}, off: { a: 1 } }).success,
    ).toBe(false);
    expect(
      parse({ mediaType: "youtube", url: "https://y.t", settings: { extra: "x" }, off: { a: 1 } })
        .success,
    ).toBe(true);
  });

  it("rejects values of the wrong type", () => {
    expect(schema.safeParse({ title: "Hi", views: "3" }).success).toBe(false);
    expect(schema.safeParse({ title: "Hi", featured: "true" }).success).toBe(false);
    expect(schema.safeParse({ title: "Hi", publishedAt: "23.09.2026" }).success).toBe(false);
    expect(schema.safeParse({ title: "Hi", status: "archived" }).success).toBe(false);
  });
});

describe("group", () => {
  const schema = dataSchema({
    seo: {
      type: "group",
      fields: {
        title: { type: "text", required: true },
        meta: { type: "group", fields: { robots: { type: "text" } } },
      },
    },
    address: { type: "group", required: true, fields: { city: { type: "text" } } },
  });

  it("validates nested data and strips unknown keys at every depth", () => {
    expect(
      schema.parse({
        seo: { title: "T", x: 1, meta: { robots: "noindex", y: 2 } },
        address: { city: "B", z: 3 },
      }),
    ).toEqual({
      seo: { title: "T", meta: { robots: "noindex" } },
      address: { city: "B" },
    });
  });

  it("allows an optional group to be missing or null and skips its required fields then", () => {
    expect(schema.safeParse({ address: {} }).success).toBe(true);
    expect(schema.safeParse({ seo: null, address: {} }).success).toBe(true);
  });

  it("requires a required group", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ address: null }).success).toBe(false);
  });

  it("checks required and typed fields inside a present group", () => {
    expect(schema.safeParse({ seo: {}, address: {} }).success).toBe(false);
    expect(
      schema.safeParse({ seo: { title: "T", meta: { robots: 1 } }, address: {} }).success,
    ).toBe(false);
  });
});

describe("slug", () => {
  const required = dataSchema({ slug: { type: "slug", from: "title", required: true } });
  const optional = dataSchema({ slug: { type: "slug", from: "title" } });

  it("matches the pattern", () => {
    for (const s of [required, optional]) {
      for (const ok of ["a", "about-us", "v2"])
        expect(s.safeParse({ slug: ok }).success, ok).toBe(true);
      for (const bad of ["Not Valid", "a--b", "-a", "a-"])
        expect(s.safeParse({ slug: bad }).success, bad).toBe(false);
    }
  });

  it("follows required like other fields", () => {
    for (const bad of [{}, { slug: null }, { slug: "" }])
      expect(required.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    for (const ok of [{}, { slug: null }, { slug: "" }])
      expect(optional.safeParse(ok).success, JSON.stringify(ok)).toBe(true);
  });
});

// Checked by `pnpm typecheck` only.
function slugTypes() {
  const f = {
    slug: { type: "slug", from: "title", parent: "parent", path: "path", required: true },
    alt: { type: "slug" },
  } as const satisfies Fields;
  (d: Data<typeof f>) => d.slug satisfies string;
  (d: Data<typeof f>) => d.alt satisfies string | null | undefined;
  // @ts-expect-error a required slug is required
  const missing: Data<typeof f> = {};
  const read = async () => {
    const doc = await defineCms({
      collections: { c: { fields: f } },
      database,
      secret: "",
    }).findById("c", "x");
    doc?.slug satisfies string | undefined;
  };
}

// Checked by `pnpm typecheck` only.
function pageTypes() {
  const pages = defineCollection({
    fields: { ...page.fields, body: { type: "textarea" } },
    hooks: page.hooks,
  });
  (d: Doc<typeof pages.fields>) =>
    [d.title, d.slug, d.path] satisfies [string, string, string | null | undefined];
}

// Checked by `pnpm typecheck` only.
function readOnlyTypes() {
  const fields = {
    title: { type: "text", required: true },
    path: { type: "text", readOnly: true },
    seo: { type: "group", readOnly: true, fields: { title: { type: "text", readOnly: true } } },
  } as const satisfies Fields;
  const input: Data<typeof fields> = { title: "A", path: "/a", seo: { title: "S" } };
}

// Checked by `pnpm typecheck` only.
function writeTypes() {
  const fields = defineCollection({
    fields: {
      author: { type: "relation", collection: "authors", required: true },
      tags: { type: "relation", collection: "tags", many: true },
      posts: { type: "join", collection: "posts", on: "author" },
    },
  }).fields;
  const d: Data<typeof fields> = { author: "a", tags: ["t"] };
  const t: string[] | null | undefined = d.tags;
  // @ts-expect-error joins are not stored
  d.posts;
  // @ts-expect-error a relation is written as ids
  const bad: Data<typeof fields> = { author: { id: "a" } };
  defineCollection({
    // @ts-expect-error `required` does not apply to joins
    fields: { p: { type: "join", collection: "posts", on: "author", required: true } },
  });
}

const database = { url: ":memory:" };
const cms = defineCms({
  collections: {
    media: {
      fields: {
        url: { type: "text", required: true },
        usedIn: { type: "join", collection: "posts", on: "seo.image" },
      },
    },
    authors: {
      fields: {
        name: { type: "text", required: true },
        avatar: { type: "relation", collection: "media" },
        posts: { type: "join", collection: "posts", on: "author" },
      },
    },
    tags: {
      fields: {
        name: { type: "text", required: true },
        posts: { type: "join", collection: "posts", on: "tags" },
      },
    },
    posts: {
      fields: {
        title: { type: "text", required: true },
        author: { type: "relation", collection: "authors" },
        tags: { type: "relation", collection: "tags", many: true },
        seo: { type: "group", fields: { image: { type: "relation", collection: "media" } } },
      },
    },
    pages: {
      fields: {
        title: { type: "text", required: true },
        parent: { type: "relation", collection: "pages", onDelete: "cascade" },
      },
    },
  },
  globals: {
    site: {
      fields: {
        logo: { type: "relation", collection: "media" },
        featured: { type: "relation", collection: "posts", many: true },
      },
    },
  },
  database,
  secret: "",
});

// Checked by `pnpm typecheck` only.
async function readTypes() {
  const p = (await cms.find("posts"))[0];
  const name: string = p.author!.name;
  const url: string | null | undefined = p.author?.avatar?.url;
  const t: string = p.tags![0].name;
  const img: string | null | undefined = p.seo?.image?.url;
  const ids = (await cms.find("posts", { populate: false }))[0];
  const aid: string | null | undefined = ids.author;
  const one = await cms.findById("posts", "x", { populate: false });
  const aid2: string | null | undefined = one?.author;
  const a = (await cms.find("authors"))[0];
  // @ts-expect-error joins are absent unless named
  a.posts;
  // @ts-expect-error `populate: false` returns ids
  ids.author?.name;

  const d1 = (await cms.find("posts", { depth: 1 }))[0];
  const av: string | null | undefined = d1.author?.avatar;
  const d0 = (await cms.find("posts", { depth: 0 }))[0];
  const s: string | null | undefined = d0.author;
  const deep = defineCms({
    collections: { pages: { fields: { parent: { type: "relation", collection: "pages" } } } },
    populate: { depth: 3 },
    database,
    secret: "",
  });
  const pg = (await deep.find("pages"))[0];
  const p3: string | null | undefined = pg.parent?.parent?.parent?.parent;
  // @ts-expect-error depth 3 ends at the fourth hop
  pg.parent?.parent?.parent?.parent?.id;

  const o = (await cms.find("posts", { populate: { author: { avatar: true }, tags: true } }))[0];
  const u: string | null | undefined = o.author?.avatar?.url;
  const oimg: string | null | undefined = o.seo?.image;
  const g = (await cms.find("posts", { populate: { seo: { image: true } } }))[0];
  const gu: string | undefined = g.seo?.image?.url;
  const g1 = (await cms.find("posts", { populate: { seo: true } }))[0];
  const gu1: string | undefined = g1.seo?.image?.url;
  // @ts-expect-error unknown key
  cms.find("posts", { populate: { autor: true } });
  // @ts-expect-error unknown nested key
  cms.find("posts", { populate: { author: { avatr: true } } });
  // @ts-expect-error scalars cannot be populated
  cms.find("posts", { populate: { title: true } });
  // @ts-expect-error an extra key next to a valid one
  cms.find("posts", { populate: { author: true, nope: true } });

  const j = (await cms.find("authors", { populate: { posts: true } }))[0];
  const title: string = j.posts[0].title;
  const author: string | null | undefined = j.posts[0].author;
  const jj = (await cms.find("authors", { populate: { posts: { tags: true } } }))[0];
  const tag: string = jj.posts[0].tags![0].name;
  const site = await cms.getGlobal("site");
  const logo: string | null | undefined = site.logo?.url;
  const siteIds = await cms.getGlobal("site", { populate: false });
  const logoId: string | null | undefined = siteIds.logo;
  // @ts-expect-error unknown global populate key
  cms.getGlobal("site", { populate: { nope: true } });

  const wide = defineCms({ collections: {} as Record<string, Collection>, database, secret: "" });
  const w = (await wide.find("x"))[0];
  w.anything;

  const sel = (await cms.find("posts", { select: { title: true, author: { name: true } } }))[0];
  sel.id satisfies string;
  sel.title satisfies string;
  sel.author?.name satisfies string | undefined;
  // @ts-expect-error not selected
  sel.tags;
  // @ts-expect-error not selected inside the relation
  sel.author?.avatar;
  // @ts-expect-error `createdAt` only when listed
  sel.createdAt;
  const meta = await cms.findById("posts", "x", { select: { createdAt: true } });
  meta?.createdAt satisfies string | undefined;
  const idOnly = (await cms.find("posts", { select: {} }))[0];
  idOnly satisfies { id: string };
  // @ts-expect-error `select: {}` returns only `id`
  idOnly.title;
  const grp = (
    await cms.find("posts", {
      populate: { seo: { image: true } },
      select: { seo: { image: { url: true } } },
    })
  )[0];
  grp.seo?.image?.url satisfies string | undefined;
  // @ts-expect-error unknown key
  cms.find("posts", { select: { titel: true } });
  // @ts-expect-error unknown nested key
  cms.find("posts", { select: { author: { nam: true } } });
  // @ts-expect-error an object on a plain field
  cms.find("posts", { select: { title: { x: true } } });
  // @ts-expect-error an object on an unresolved relation
  cms.find("posts", { populate: false, select: { author: { name: true } } });
  // @ts-expect-error depth 1 resolves author but not avatar
  cms.find("posts", { depth: 1, select: { author: { avatar: { url: true } } } });
  // @ts-expect-error a join is resolved only when populate names it
  cms.find("authors", { select: { posts: { title: true } } });
  const jsel = (
    await cms.find("authors", { populate: { posts: true }, select: { posts: { title: true } } })
  )[0];
  jsel.posts[0].title satisfies string;
  const gsel = await cms.getGlobal("site", { select: { logo: { url: true } } });
  gsel.logo?.url satisfies string | undefined;
  // @ts-expect-error not selected in a global
  gsel.featured;
  // @ts-expect-error unknown global key
  cms.getGlobal("site", { select: { nope: true } });
  // @ts-expect-error a global has no `id`, `createdAt` or `updatedAt`
  cms.getGlobal("site", { select: { id: true } });
  // @ts-expect-error nor does a group
  cms.find("posts", { select: { seo: { id: true } } });
  cms.find("posts", { select: { id: true, createdAt: true, author: { updatedAt: true } } });
  const ws = (await wide.find("x", { select: { anything: { nested: true } } }))[0];
  ws.whatever;
}

// Checked by `pnpm typecheck` only.
async function httpTypes() {
  const cms = defineCms({
    collections: {
      people: {
        fields: {
          name: { type: "text", required: true, private: true },
          handle: { type: "slug", from: "name", required: true, private: true },
          slug: { type: "slug", from: "name", required: true },
          profile: {
            type: "group",
            fields: {
              bio: { type: "text" },
              note: { type: "text", required: true, private: true },
            },
          },
        },
      },
      posts: { fields: { author: { type: "relation", collection: "people" } } },
    },
    database,
    secret: "",
  });
  const client = createClient<typeof cms>();
  const person = await client.findById("people", "x");
  const bio: string | null | undefined = person.profile?.bio;
  // @ts-expect-error private fields are missing on public reads
  const name: string = person.name;
  // @ts-expect-error also inside groups
  const note: string = person.profile!.note;
  // @ts-expect-error a private slug is missing on public reads too
  const handle: string = person.handle;
  person.slug satisfies string;
  const local = await cms.findById("people", "x");
  local?.handle satisfies string | undefined;
  local?.name satisfies string | undefined;
  const post = await client.findById("posts", "x");
  // @ts-expect-error also in populated documents
  const author: string = post.author!.name;
  client.create("people", { slug: "x" });
}

describe("defineCms checks", () => {
  const define =
    (collections: Record<string, Collection>, globals: Record<string, { fields: Fields }> = {}) =>
    () =>
      defineCms({ collections, globals, database: { url: ":memory:" }, secret: "x".repeat(32) });
  const g = { type: "group", fields: { t: { type: "text" } } } as const;

  it("throws for a condition on an unknown field", () => {
    expect(define({ c: { fields: { a: { type: "text", condition: { nope: 1 } } } } })).toThrow(
      /"c.a" names unknown field "nope"/,
    );
    expect(
      define({ c: { fields: { g, a: { type: "text", condition: { "/g.nope": 1 } } } } }),
    ).toThrow(/unknown field "\/g.nope"/);
    expect(
      define({
        c: { fields: { a: { type: "text", condition: { $some: [{ $every: [{ nope: 1 }] }] } } } },
      }),
    ).toThrow(/unknown field "nope"/);
    const root = {
      x: { type: "text" },
      g: { type: "group", fields: { a: { type: "text", condition: { x: 1 } } } },
    } as const;
    expect(define({ c: { fields: root } })).toThrow(/"c.g.a" names unknown field "x"/);
    expect(define({}, { s: { fields: { a: { type: "text", condition: { nope: 1 } } } } })).toThrow(
      /unknown field "nope"/,
    );
  });

  it("accepts conditions on siblings, root paths and group paths", () => {
    const fields = {
      x: { type: "text" },
      g,
      a: { type: "text", condition: { x: 1, "g.t": "y", $some: [{ "/g.t": "z" }] } },
      h: {
        type: "group",
        fields: { t: { type: "text" }, b: { type: "text", condition: { t: 1, "/x": 2 } } },
      },
    } as const;
    expect(define({ c: { fields } })).not.toThrow();
  });

  it("throws for unique inside a group, in a global, on boolean, custom, group, join and many relations", () => {
    const bad = [
      { g: { type: "group", fields: { t: { type: "text", unique: true } } } },
      { g: { type: "group", fields: { s: { type: "slug", unique: true } } } },
      { b: { type: "boolean", unique: true } },
      { c: { type: "custom:color", unique: true } },
      { g: { type: "group", unique: true, fields: {} } },
      {
        j: { type: "join", collection: "c", on: "r", unique: true },
        r: { type: "relation", collection: "c" },
      },
      { r: { type: "relation", collection: "c", many: true, unique: true } },
    ] as Fields[];
    for (const fields of bad)
      expect(define({ c: { fields } }), JSON.stringify(fields)).toThrow(/cannot be unique/);
    expect(define({}, { s: { fields: { t: { type: "text", unique: true } } } })).toThrow(
      /"s.t" cannot be unique/,
    );
  });

  it("accepts unique on top-level text, textarea, number, date, select, slug and single relation fields", () => {
    const fields: Fields = {
      a: { type: "text", unique: true },
      b: { type: "textarea", unique: true },
      c: { type: "number", unique: true },
      d: { type: "date", unique: true },
      e: { type: "select", options: ["x"], unique: true },
      f: { type: "relation", collection: "c", unique: true },
      g: { type: "slug", from: "a", unique: true },
    };
    expect(define({ c: { fields } })).not.toThrow();
  });

  it("throws for an invalid pattern, also under a condition", () => {
    expect(define({ c: { fields: { a: { type: "text", pattern: "(" } } } })).toThrow();
    expect(
      define({
        c: {
          fields: { x: { type: "text" }, a: { type: "text", pattern: "(", condition: { x: "y" } } },
        },
      }),
    ).toThrow();
  });
});

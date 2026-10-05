import { describe, expect, it } from "vitest";
import { createClient } from "../client/index.ts";
import { defineCms } from "../index.ts";
import { page } from "../presets/index.ts";
import {
  type Collection,
  type Data,
  defineCollection,
  defineGlobal,
  type Doc,
  type Fields,
  type File,
  type Image,
  type Populate,
  type Resolve,
  type Select,
} from "./index.ts";
import { checkSchema } from "./validation/check-schema.ts";
import { dataSchema } from "./validation/build-data-schema.ts";
import { relationPaths } from "./traversal/relation-paths.ts";
import { targetOf } from "./traversal/reference-fields.ts";

describe("group types", () => {
  const fields = {
    seo: { type: "group", fields: { title: { type: "text" }, noindex: { type: "boolean" } } },
    address: {
      type: "group",
      required: true,
      fields: { geo: { type: "group", fields: { lat: { type: "number" } } } },
    },
  } as const satisfies Fields;

  it("infers nested group types", () => {
    // Type-level only. The function never runs.
    (d: Data<typeof fields>) => {
      const title: string | null | undefined = d.seo?.title;
      const lat: number | null | undefined = d.address.geo?.lat;
      // @ts-expect-error an optional group can be null
      d.seo.title;
      // @ts-expect-error `noindex` is a boolean
      const n: string | null | undefined = d.seo?.noindex;
    };
  });
});

describe("relation values", () => {
  const s = dataSchema({
    author: { type: "relation", collection: "authors" },
    tags: { type: "relation", collection: "tags", many: true },
    lead: { type: "relation", collection: "authors", required: true, many: true },
    posts: { type: "join", collection: "posts", on: "author" },
  });

  it("accepts ids, keeps order and strips joins", () => {
    expect(s.parse({ author: "a", tags: ["y", "x"], lead: ["a"], posts: ["p"] })).toEqual({
      author: "a",
      tags: ["y", "x"],
      lead: ["a"],
    });
  });

  it("rejects duplicates, empty ids and an empty required many", () => {
    expect(s.safeParse({ lead: ["a", "a"] }).success).toBe(false);
    expect(s.safeParse({ lead: ["a"], author: "" }).success).toBe(false);
    expect(s.safeParse({ lead: [] }).success).toBe(false);
    expect(s.safeParse({ lead: ["a"], tags: "x" }).success).toBe(false);
  });
});

// Checked by `pnpm typecheck` only.
// `satisfies` checks excess keys, which generic inference in `defineCollection` skips.
function optionTypes() {
  ({
    a: {
      type: "text",
      minLength: 1,
      maxLength: 9,
      pattern: "[a-z]+",
      placeholder: "x",
      description: "Help",
      default: "x",
      condition: { b: { gt: 0 } },
      unique: true,
      private: true,
      validate: (v) => v !== "no" || "Not allowed",
    },
    b: { type: "number", min: 0, max: 9, default: ({ user }) => (user ? 1 : 0) },
    r: {
      type: "relation",
      collection: "authors",
      default: ({ user }) => user?.id,
      validate: (v, { siblingData }) => !!v || String(siblingData.a),
    },
    h: {
      type: "text",
      description: "Secret",
      condition: { $some: [{ a: "x" }, { "/b": { exists: true } }] },
    },
    j: { type: "join", collection: "posts", on: "author", description: "Posts", private: true },
    // @ts-expect-error `min` is for numbers
    c: { type: "text", min: 1 },
    // @ts-expect-error `pattern` is for text
    d: { type: "number", pattern: "1" },
    // @ts-expect-error a RegExp cannot reach the admin
    e: { type: "text", pattern: /x/ },
    // @ts-expect-error `placeholder` is not for booleans
    f: { type: "boolean", placeholder: "x" },
    // @ts-expect-error a default has the field's type
    g: { type: "number", default: "x" },
    // @ts-expect-error joins are not stored, so they have no default
    k: { type: "join", collection: "posts", on: "author", default: [] },
  }) satisfies Fields;
}

describe("media fields", () => {
  const fields = {
    hero: { type: "image", required: true, image: { preset: "og", width: 800 } },
    gallery: { type: "image", many: true },
    doc: { type: "file", accept: ["application/pdf"], maxSize: 1024, folder: "docs" },
    seo: { type: "group", fields: { og: { type: "image" } } },
  } as const satisfies Fields;

  it("stores ids like a relation", () => {
    const s = dataSchema(fields);
    expect(s.parse({ hero: "a", gallery: ["b", "c"], doc: "d" })).toEqual({
      hero: "a",
      gallery: ["b", "c"],
      doc: "d",
    });
    expect(s.safeParse({ gallery: ["b"] }).success).toBe(false);
    expect(s.safeParse({ hero: "a", gallery: ["b", "b"] }).success).toBe(false);
  });

  it("finds image and file fields with target media", () => {
    expect(relationPaths(fields).map((r) => [r.path.join("."), targetOf(r.field)])).toEqual([
      ["hero", "media"],
      ["gallery", "media"],
      ["doc", "media"],
      ["seo.og", "media"],
    ]);
  });

  it("types stored ids and populated images and files", () => {
    // Type-level only. The functions never run.
    (d: Data<typeof fields>) => {
      const hero: string = d.hero;
      const gallery: string[] | null | undefined = d.gallery;
    };
    (r: Resolve<{}, typeof fields, 2>) => {
      const hero: Image = r.hero;
      const gallery: Image[] | null | undefined = r.gallery;
      const doc: File | null | undefined = r.doc;
      const og: Image | null | undefined = r.seo?.og;
      const srcset: string = r.hero.srcset;
      // @ts-expect-error a file has no srcset
      r.doc?.srcset;
    };
    (r: Resolve<{}, typeof fields, false>) => {
      const hero: string = r.hero;
    };
  });

  it("accepts true for populate and select, nothing deeper", () => {
    const populate: Populate<{}, typeof fields> = { hero: true, seo: { og: true } };
    // @ts-expect-error an image does not populate deeper
    const deep: Populate<{}, typeof fields> = { hero: { alt: true } };
    const select: Select<{}, typeof fields, 2> = { hero: true, doc: true };
    // @ts-expect-error an image selects whole
    const deepSelect: Select<{}, typeof fields, 2> = { hero: { alt: true } };
  });

  it("rejects image options on a file field", () => {
    // @ts-expect-error `image` is only on image fields
    ({ f: { type: "file", image: { preset: "x" } } }) satisfies Fields;
  });
});

describe("media field checks", () => {
  const check =
    (fields: Fields, collections = { media: { fields: {} } }) =>
    () =>
      checkSchema({ collections: { ...collections, c: { fields } } }, { depth: 2, maxDepth: 5 });

  it("needs the media option", () => {
    expect(check({ i: { type: "image" } }, {} as never)).toThrow(/needs the `media` option/);
    expect(check({ g: { type: "group", fields: { f: { type: "file" } } } }, {} as never)).toThrow(
      /"c.g.f" needs the `media` option/,
    );
    expect(check({ i: { type: "image" } })).not.toThrow();
  });

  it("rejects relations to media and cascade", () => {
    expect(check({ r: { type: "relation", collection: "media" } })).toThrow(/image or file field/);
    expect(check({ i: { type: "image", onDelete: "cascade" } as never })).toThrow(/cascade/);
    expect(check({ i: { type: "image", onDelete: "set-null" } })).not.toThrow();
  });

  it("allows unique on a single image or file", () => {
    expect(
      check({ i: { type: "image", unique: true }, f: { type: "file", unique: true } }),
    ).not.toThrow();
    expect(check({ i: { type: "image", many: true, unique: true } })).toThrow(/cannot be unique/);
  });
});

describe("hook types", () => {
  it("infers arguments from the fields of the same defineCollection call", () => {
    const posts = defineCollection({
      fields: {
        title: {
          type: "text",
          required: true,
          hooks: { beforeChange: [({ value }) => value?.toUpperCase()] },
        },
        views: { type: "number" },
      },
      hooks: {
        beforeChange: [
          ({ data }) => {
            data.title satisfies string;
            // @ts-expect-error unknown field
            data.nope;
          },
        ],
        afterRead: { count: ({ docs }) => docs.map((d) => ({ ...d, views: (d.views ?? 0) + 1 })) },
      },
    });
    defineCms({ collections: { posts }, database: { url: ":memory:" }, secret: "" });
    // A record keeps its keys, so a host can leave one hook out by name.
    const { count, ...rest } = posts.hooks.afterRead;
    defineCollection({ fields: posts.fields, hooks: { afterRead: rest } });
    expect(defineCollection({ fields: {} }).hooks).toEqual({});
    expect(defineGlobal({ fields: {} }).hooks).toEqual({});
    defineCollection({
      fields: {
        // @ts-expect-error field hook value is a number
        n: { type: "number", hooks: { beforeChange: [({ value }) => value?.toUpperCase()] } },
      },
    });
    const site = defineGlobal({
      fields: { name: { type: "text" } },
      hooks: { afterRead: [({ docs }) => docs.map((d) => ({ ...d, name: d.name ?? "x" }))] },
    });
    defineCms({ collections: {}, globals: { site }, database: { url: ":memory:" }, secret: "" });
    // Inline collections get untyped arguments.
    defineCms({
      collections: {
        a: {
          fields: { t: { type: "text" } },
          hooks: { beforeChange: [({ data }) => ({ ...data, t: data.anything })] },
        },
      },
      database: { url: ":memory:" },
      secret: "",
    });
  });
});

describe("media reads", () => {
  it("types the computed fields of find('media')", async () => {
    const cms = defineCms({ database: { url: ":memory:" }, secret: "", media: false });
    const typed = defineCms({ database: { url: ":memory:" }, secret: "", media: true });
    const read = async () => {
      const [doc] = await typed.find("media");
      const url: string = doc.url;
      const src: string | null | undefined = doc.src;
      const srcset: string | null | undefined = doc.srcset;
      const one = await typed.findById("media", "x");
      const u: string | undefined = one?.url;
      // @ts-expect-error media: false has no media collection
      await cms.find("media");
      // @ts-expect-error media: false has no cms.media
      cms.media;
      typed.media.upload;
    };
    expect(read).toBeTypeOf("function");
  });
});

describe("nav option", () => {
  it("accepts display, group, icon and order", () => {
    defineCollection({
      description: "d",
      nav: { display: "settings", group: "Blog", icon: "newspaper", order: 5 },
      fields: {},
    });
    defineGlobal({
      description: "d",
      nav: { display: "settings", group: "Blog", icon: "newspaper", order: 5 },
      fields: {},
    });
  });

  it("rejects an unknown display", () => {
    // @ts-expect-error not a display value
    defineCollection({ nav: { display: "sidebar" }, fields: {} });
    expect(true).toBe(true);
  });

  it("rejects an unknown icon name", () => {
    // @ts-expect-error not a Lucide icon
    defineCollection({ nav: { icon: "not-an-icon" }, fields: {} });
    expect(true).toBe(true);
  });

  it("has no top-level group", () => {
    // @ts-expect-error the key moved to nav
    ({ group: "Blog", fields: {} }) satisfies Collection;
    expect(true).toBe(true);
  });
});

describe("settings", () => {
  const base = { database: { url: ":memory:" }, secret: "" };

  it("types both defaults when omitted", async () => {
    const cms = defineCms(base);
    const read = async () => {
      const general = await cms.getGlobal("general");
      const title: string | null | undefined = general.title;
      const google: string | null | undefined = (await cms.getGlobal("seo")).verification?.google;
      // @ts-expect-error a default has no `other`
      general.other;
    };
    expect(read).toBeTypeOf("function");
  });

  it("removes a dropped default", async () => {
    const one = defineCms({ ...base, settings: { general: false } });
    const none = defineCms({ ...base, settings: false });
    const read = async () => {
      // @ts-expect-error general is dropped
      await one.getGlobal("general");
      await one.getGlobal("seo");
      // @ts-expect-error general is dropped
      await none.getGlobal("general");
      // @ts-expect-error seo is dropped
      await none.getGlobal("seo");
    };
    expect(read).toBeTypeOf("function");
  });

  it("types a replacement by its own fields", async () => {
    const cms = defineCms({
      ...base,
      settings: { general: { fields: { name: { type: "text", required: true } } } },
    });
    const read = async () => {
      const general = await cms.getGlobal("general");
      const name: string | null | undefined = general.name;
      // @ts-expect-error the default's field is gone
      general.tagline;
      await cms.getGlobal("seo");
    };
    expect(read).toBeTypeOf("function");
  });

  it("rejects an unknown settings key", () => {
    defineCms({
      ...base,
      settings: {
        // @ts-expect-error only `general` and `seo` exist
        other: { fields: {} },
      },
    });
    defineCms({
      ...base,
      settings: {
        seo: false,
        // @ts-expect-error only `general` and `seo` exist
        other: { fields: {} },
      },
    });
  });

  it("accepts options cast as never", () => {
    defineCms({ ...base } as never);
  });

  it("types the client", async () => {
    const cms = defineCms(base);
    const client = createClient<typeof cms>();
    const read = async () => {
      const title: string | null | undefined = (await client.getGlobal("general")).title;
      // @ts-expect-error not a global
      await client.getGlobal("other");
    };
    expect(read).toBeTypeOf("function");
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
    assets: {
      fields: {
        url: { type: "text", required: true },
        usedIn: { type: "join", collection: "posts", on: "seo.image" },
      },
    },
    authors: {
      fields: {
        name: { type: "text", required: true },
        avatar: { type: "relation", collection: "assets" },
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
        seo: { type: "group", fields: { image: { type: "relation", collection: "assets" } } },
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
        logo: { type: "relation", collection: "assets" },
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

import { describe, expect, expectTypeOf, it } from "vitest";
import { createClient } from "../client/index.ts";
import { defineCms, definePlugin } from "../index.ts";
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
  type Locale,
  type Populate,
  type Resolve,
  type Select,
} from "./index.ts";
import type { FilterKey } from "./inference/data.ts";
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

describe("array types", () => {
  const fields = {
    title: { type: "text" },
    links: {
      type: "array",
      fields: {
        label: { type: "text", required: true },
        tags: { type: "array", fields: { name: { type: "text" } } },
      },
    },
  } as const satisfies Fields;

  it("infers items with an id", () => {
    // Type-level only. The function never runs.
    (d: Data<typeof fields>) => {
      const id: string | undefined = d.links?.[0]?.id;
      const label: string | undefined = d.links?.[0]?.label;
      const name: string | null | undefined = d.links?.[0]?.tags?.[0]?.name;
      // @ts-expect-error `label` is a string
      const n: number | undefined = d.links?.[0]?.label;
    };
  });

  it("accepts items without an id on write", () => {
    const data: Data<typeof fields> = { links: [{ label: "a" }, { id: "x", label: "b" }] };
  });

  it("is not filterable", () => {
    expectTypeOf<FilterKey<typeof fields>>().toEqualTypeOf<"title">();
  });

  it("checks relation targets inside items", () => {
    const db = { database: { url: ":memory:" }, secret: "" };
    const pages = defineCollection({ fields: {} });
    const valid = defineCollection({
      fields: {
        links: {
          type: "array",
          fields: {
            sub: { type: "array", fields: { page: { type: "relation", collection: "pages" } } },
          },
        },
      },
    });
    const invalid = defineCollection({
      fields: {
        links: {
          type: "array",
          fields: {
            sub: { type: "array", fields: { page: { type: "relation", collection: "nope" } } },
          },
        },
      },
    });
    () => {
      defineCms({ ...db, collections: { pages, valid } });
      // @ts-expect-error unknown collection inside an array item
      defineCms({ ...db, collections: { pages, invalid } });
    };
  });
});

describe("blocks types", () => {
  const fields = {
    title: { type: "text" },
    content: {
      type: "blocks",
      blocks: {
        hero: { fields: { heading: { type: "text", required: true } } },
        text: { fields: { body: { type: "textarea" } } },
      },
    },
  } as const satisfies Fields;

  it("narrows an item on blockType", () => {
    // Type-level only. The function never runs.
    (d: Data<typeof fields>) => {
      const item = d.content![0]!;
      const type: "hero" | "text" = item.blockType;
      if (item.blockType === "hero") {
        const heading: string = item.heading;
        // @ts-expect-error `body` belongs to the text block
        item.body;
      } else item.body satisfies string | null | undefined;
    };
  });

  it("accepts items without an id on write and rejects an unknown block", () => {
    const data: Data<typeof fields> = {
      content: [
        { blockType: "hero", heading: "a" },
        { id: "x", blockType: "text" },
      ],
    };
    // @ts-expect-error unknown block
    const bad: Data<typeof fields> = { content: [{ blockType: "nope" }] };
  });

  it("is not filterable", () => {
    expectTypeOf<FilterKey<typeof fields>>().toEqualTypeOf<"title">();
  });

  it("checks relation targets inside blocks", () => {
    const db = { database: { url: ":memory:" }, secret: "" };
    const pages = defineCollection({ fields: {} });
    const blocks = (collection: string) => ({
      fields: {
        content: {
          type: "blocks" as const,
          blocks: { hero: { fields: { page: { type: "relation" as const, collection } } } },
        },
      },
    });
    const valid = defineCollection({
      fields: {
        content: {
          type: "blocks",
          blocks: { hero: { fields: { page: { type: "relation", collection: "pages" } } } },
        },
      },
    });
    const invalid = defineCollection({
      fields: {
        content: {
          type: "blocks",
          blocks: { hero: { fields: { page: { type: "relation", collection: "nope" } } } },
        },
      },
    });
    () => {
      defineCms({ ...db, collections: { pages, valid, wide: blocks("pages") } });
      // @ts-expect-error unknown collection inside a block
      defineCms({ ...db, collections: { pages, invalid } });
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
async function arrayReadTypes() {
  const cms = defineCms({
    collections: {
      pages: { fields: { title: { type: "text", required: true } } },
      menus: {
        fields: {
          links: {
            type: "array",
            fields: {
              label: { type: "text", required: true },
              page: { type: "relation", collection: "pages" },
            },
          },
        },
      },
    },
    database,
    secret: "",
    media: false,
  });
  const item = (await cms.find("menus"))[0].links![0];
  const id: string = item.id;
  item.page?.title satisfies string | undefined;
  const ids = (await cms.find("menus", { populate: false }))[0].links![0];
  ids.page satisfies string | null | undefined;
  // @ts-expect-error `populate: false` returns ids inside items too
  ids.page?.title;
  const named = (await cms.find("menus", { populate: { links: { page: true } } }))[0].links![0];
  named.page?.title satisfies string | undefined;
  const sel = (await cms.find("menus", { select: { links: { label: true } } }))[0].links![0];
  sel satisfies { id: string; label: string };
  // @ts-expect-error not selected inside the item
  sel.page;
  const off = await cms.find("menus", { populate: false, select: { links: { label: true } } });
  off[0].links![0].label satisfies string;
  // @ts-expect-error unknown item key in select
  cms.find("menus", { select: { links: { nope: true } } });
  // @ts-expect-error unknown item key in populate
  cms.find("menus", { populate: { links: { nope: true } } });
  // @ts-expect-error scalars inside items cannot be populated
  cms.find("menus", { populate: { links: { label: true } } });
  // @ts-expect-error an object on an unresolved relation inside an item
  cms.find("menus", { populate: false, select: { links: { page: { title: true } } } });
}

// Checked by `pnpm typecheck` only.
async function blocksReadTypes() {
  const cms = defineCms({
    collections: {
      pages: { fields: { title: { type: "text", required: true } } },
      landing: {
        fields: {
          content: {
            type: "blocks",
            blocks: {
              hero: {
                fields: {
                  heading: { type: "text", required: true },
                  page: { type: "relation", collection: "pages" },
                },
              },
              text: { fields: { body: { type: "text" } } },
            },
          },
        },
      },
    },
    database,
    secret: "",
    media: false,
  });
  const item = (await cms.find("landing"))[0].content![0];
  const id: string = item.id;
  if (item.blockType === "hero") item.page?.title satisfies string | undefined;
  else item.body satisfies string | null | undefined;

  const ids = (await cms.find("landing", { populate: false }))[0].content![0];
  if (ids.blockType === "hero") {
    ids.page satisfies string | null | undefined;
    // @ts-expect-error `populate: false` returns ids inside blocks too
    ids.page?.title;
  }

  const named = (await cms.find("landing", { populate: { content: { hero: { page: true } } } }))[0]
    .content![0];
  if (named.blockType === "hero") named.page?.title satisfies string | undefined;
  const all = (await cms.find("landing", { populate: { content: true } }))[0].content![0];
  if (all.blockType === "hero") all.page?.title satisfies string | undefined;

  const sel = (await cms.find("landing", { select: { content: { hero: { heading: true } } } }))[0]
    .content![0];
  sel.id satisfies string;
  sel.blockType satisfies "hero" | "text";
  if (sel.blockType === "hero") {
    sel.heading satisfies string;
    // @ts-expect-error not selected inside the block
    sel.page;
  }
  await cms.find("landing", { select: { content: { hero: true, text: { body: true } } } });
  await cms.find("landing", { populate: false, select: { content: { text: { body: true } } } });

  // @ts-expect-error unknown block name in select
  cms.find("landing", { select: { content: { nope: true } } });
  // @ts-expect-error unknown block name in populate
  cms.find("landing", { populate: { content: { nope: true } } });
  // @ts-expect-error item fields MUST be named under their block
  cms.find("landing", { populate: { content: { page: true } } });
  // @ts-expect-error unknown field in a block
  cms.find("landing", { select: { content: { hero: { body: true } } } });
  cms.find("landing", {
    populate: false,
    // @ts-expect-error an object on an unresolved relation inside a block
    select: { content: { hero: { page: { title: true } } } },
  });
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
          links: {
            type: "array",
            fields: {
              url: { type: "text" },
              note: { type: "text", required: true, private: true },
            },
          },
          content: {
            type: "blocks",
            blocks: {
              quote: {
                fields: {
                  text: { type: "text" },
                  source: { type: "text", required: true, private: true },
                },
              },
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
  // @ts-expect-error also inside array items
  const itemNote: string = person.links![0].note;
  person.links![0].id satisfies string;
  // @ts-expect-error also inside block items
  const source: string = person.content![0].source;
  person.content![0].blockType satisfies "quote";
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

describe("admin.adminBar option", () => {
  const base = { database: { url: ":memory:" }, secret: "" };

  it("accepts a position, individual items and false", () => {
    defineCms({
      ...base,
      admin: {
        adminBar: {
          position: "bottom-center",
          items: {
            a: { label: "A", href: "/a", children: { b: { label: "B" } } },
            gone: false,
          },
        },
      },
    });
    defineCms({ ...base, admin: { adminBar: false } });
    definePlugin({ name: "x", admin: { adminBar: { items: { a: { label: "A" } } } } });
    expect(true).toBe(true);
  });

  it("rejects an unknown position", () => {
    // @ts-expect-error not a position
    expect(() => defineCms({ ...base, admin: { adminBar: { position: "left" } } })).toThrow(
      "adminBar.position",
    );
  });
});

describe("localization types", () => {
  const base = { database: { url: ":memory:" }, secret: "" };
  const cms = defineCms({
    ...base,
    collections: {
      posts: {
        localized: true,
        fields: {
          title: { type: "text", required: true },
          hero: { type: "text", localized: false },
        },
      },
      tags: { fields: { name: { type: "text" } } },
    },
    globals: { footer: { localized: true, fields: { note: { type: "text" } } } },
    localization: { locales: ["en", "de"], defaultLocale: "en" },
  });
  const plain = defineCms({
    ...base,
    collections: { tags: { fields: { name: { type: "text" } } } },
  });

  it("types the locale options by the configured locales", async () => {
    const run = async () => {
      await cms.find("posts", { locale: "de", fallback: false });
      await cms.findById("posts", "x", { locale: "en" });
      // @ts-expect-error not a configured locale
      await cms.find("posts", { locale: "fr" });
      await cms.create("posts", { title: "x" }, { locale: "de" });
      // @ts-expect-error not a configured locale
      await cms.update("posts", "x", {}, { locale: "fr" });
      await cms.publish("posts", "x", { locale: "de" });
      await cms.discard("posts", "x", { all: true });
      await cms.getGlobal("footer", { locale: "de" });
      // @ts-expect-error not a configured locale
      await cms.getGlobal("footer", { locale: "fr" });
      const client = createClient<typeof cms>();
      await client.find("posts", { locale: "de", fallback: true, alternates: true });
      await client.findOne("posts", { where: { title: "x" }, locale: "de" });
      // @ts-expect-error not a configured locale
      await client.findById("posts", "x", { locale: "fr" });
      await client.create("posts", { title: "x" }, { locale: "de" });
      await client.updateDraft("posts", "x", {}, { locale: "de" });
      await client.publish("posts", "x", { locale: "de" });
      await client.discard("posts", "x", { all: true });
      // @ts-expect-error `all` is a flag, not a locale
      await client.discard("posts", "x", { all: false });
      await client.setGlobal("footer", {}, { locale: "de" });
      await client.copyLocale("posts", "x", { from: "en", to: "de" });
      // @ts-expect-error not a configured locale
      await client.copyLocale("posts", "x", { from: "en", to: "fr" });
      await client.removeLocale("posts", "x", "de");
      await client.copyGlobalLocale("footer", { from: "en", to: "de" });
      await client.removeGlobalLocale("footer", "de");
      await client.discardGlobal("footer", { all: true });
      const l = await client.localization();
      l?.defaultLocale satisfies "en" | "de" | undefined;
      l?.locales satisfies readonly ("en" | "de")[] | undefined;
    };
    expect(run).toBeTypeOf("function");
  });

  it("makes locale `never` without localization", async () => {
    const run = async () => {
      // @ts-expect-error the instance has no locales
      await plain.find("tags", { locale: "en" });
      // @ts-expect-error the instance has no locales
      await plain.create("tags", {}, { locale: "en" });
      await createClient<typeof plain>().find("tags", { where: { name: "x" } });
      // @ts-expect-error the instance has no locales
      await createClient<typeof plain>().find("tags", { locale: "en" });
      // @ts-expect-error the instance has no locales
      await createClient<typeof plain>().create("tags", {}, { locale: "en" });
      // @ts-expect-error the instance has no locales
      await createClient<typeof plain>().copyLocale("tags", "x", { from: "en", to: "de" });
      const l = await createClient<typeof plain>().localization();
      l satisfies null;
    };
    expect(run).toBeTypeOf("function");
    expectTypeOf<Locale<typeof plain>>().toBeNever();
    expectTypeOf<Locale<typeof cms>>().toEqualTypeOf<"en" | "de">();
  });

  it("adds locale metadata to localized collections only", async () => {
    const run = async () => {
      const local = await cms.findById("posts", "x");
      local?.locale satisfies "en" | "de" | undefined;
      local?.locales satisfies ("en" | "de")[] | undefined;
      // @ts-expect-error alternates need the option
      local?.alternates;
      const tag = await cms.findById("tags", "x");
      // @ts-expect-error not localized
      tag?.locale;
      // @ts-expect-error not localized
      tag?.locales;

      const client = createClient<typeof cms>();
      const post = await client.findById("posts", "x");
      post.locale satisfies "en" | "de";
      post.locales satisfies ("en" | "de")[];
      // @ts-expect-error alternates need the option
      post.alternates;
      // @ts-expect-error not localized
      (await client.findById("tags", "x")).locale;
      const footer = await client.getGlobal("footer");
      footer.locale satisfies "en" | "de";
      // @ts-expect-error globals have no alternates
      footer.alternates;
    };
    expect(run).toBeTypeOf("function");
  });

  it("adds alternates only with `alternates: true`", async () => {
    const run = async () => {
      const client = createClient<typeof cms>();
      const on = await client.findById("posts", "x", { alternates: true });
      on.alternates satisfies Partial<Record<"en" | "de" | "x-default", string>>;
      // @ts-expect-error not a locale
      on.alternates.fr;
      // @ts-expect-error without the option
      (await client.findById("posts", "x", { alternates: false })).alternates;
      const [first] = await cms.find("posts", { alternates: true });
      first.alternates satisfies Partial<Record<"en" | "de" | "x-default", string>>;
      // @ts-expect-error tags have no permalink or locales
      (await client.findById("tags", "x", { alternates: true })).alternates;
    };
    expect(run).toBeTypeOf("function");
  });

  it("lets `select` list the locale metadata", async () => {
    const run = async () => {
      const client = createClient<typeof cms>();
      const only = await client.findById("posts", "x", { select: { title: true } });
      // @ts-expect-error not selected
      only.locale;
      const picked = await client.findById("posts", "x", { select: { locale: true } });
      picked.locale satisfies "en" | "de";
      // @ts-expect-error not selected
      picked.locales;
      const alt = await client.findById("posts", "x", {
        alternates: true,
        select: { alternates: true, locales: true },
      });
      alt.alternates satisfies object;
      alt.locales satisfies ("en" | "de")[];
      // @ts-expect-error selected, but the option is off
      (await client.findById("posts", "x", { select: { alternates: true } })).alternates;
      // @ts-expect-error not a field or metadata key
      await client.findById("posts", "x", { select: { language: true } });
      // @ts-expect-error without localization, `locale` is not a metadata key
      await createClient<typeof plain>().findById("tags", "x", { select: { locale: true } });
    };
    expect(run).toBeTypeOf("function");
  });
});

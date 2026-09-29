import { describe, expect, it } from "vitest";
import { createClient } from "../client/index.ts";
import { matchCondition } from "./condition.ts";
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
import { checkSchema, dataSchema } from "./validate.ts";
import { relationPaths, targetOf } from "./walk.ts";
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

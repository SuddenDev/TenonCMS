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

import { describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { page } from "../presets/index.ts";
import { admin, setup, status, testDatabase } from "./setup.ts";

const options = {
  collections: {
    categories: { fields: { slug: { type: "text" } } },
    posts: {
      preview: "/{category.slug}/{slug}",
      fields: {
        slug: { type: "text" },
        category: { type: "relation", collection: "categories" },
      },
    },
    notes: {
      preview: async (doc: Record<string, unknown>, { cms }: { cms: any }) => {
        if (!doc.post) return null;
        const post = await cms.findById("posts", doc.post as string);
        return `/notes/${post.slug}`;
      },
      fields: { post: { type: "relation", collection: "posts" } },
    },
    plain: { visualEditing: false, fields: { title: { type: "text" } } },
    linked: { permalink: "/linked/{slug}", fields: { slug: { type: "text" } } },
  },
  globals: {
    home: { preview: "/", fields: { title: { type: "text" } } },
    linkedGlobal: { permalink: "/linked", fields: { title: { type: "text" } } },
    plainGlobal: { visualEditing: false, fields: { title: { type: "text" } } },
  },
  media: false,
  database: testDatabase(),
  secret: "x".repeat(32),
} as const;

async function signedIn() {
  const s = setup(defineCms(options));
  await s.client.signUp(admin);
  return s;
}

describe("preview", () => {
  it("rejects a placeholder that names no stored field", () => {
    const bad = (preview: string) => () =>
      defineCms({
        ...options,
        collections: { ...options.collections, posts: { ...options.collections.posts, preview } },
      });
    expect(bad("/{nope}")).toThrow(`preview of "posts" names unknown field "nope"`);
    expect(bad("/{category.nope}")).toThrow(`names unknown field "category.nope"`);
    expect(bad("/{category.slug.x}")).toThrow(`names unknown field "category.slug.x"`);
  });

  it("accepts the pages preset", () => {
    expect(() =>
      defineCms({
        collections: { pages: page() },
        media: false,
        database: options.database,
        secret: options.secret,
      }),
    ).not.toThrow();
    expect(page().permalink).toBe("{path}");
  });

  it("sends `preview`, `visualEditing` and `site` in the schema", async () => {
    const { client } = setup(defineCms({ ...options, site: "https://example.com/blog" }));
    await client.signUp(admin);
    const schema = await client.getSchema();
    expect(schema).toMatchObject({ site: "https://example.com/blog" });
    expect(schema.collections?.posts.preview).toBe(true);
    expect(schema.collections?.notes.preview).toBe(true);
    expect(schema.collections?.linked).toMatchObject({ preview: true });
    expect(schema.collections?.plain).not.toHaveProperty("preview");
    expect(schema.globals?.home.preview).toBe(true);
    expect(schema.globals?.linkedGlobal).toMatchObject({ preview: true });
    expect(schema.collections?.plain.visualEditing).toBe(false);
    expect(schema.globals?.plainGlobal.visualEditing).toBe(false);
    expect(schema.collections?.posts).not.toHaveProperty("visualEditing");
  });

  it("resolves templates, functions, permalinks and globals, and answers 404 without `preview`", async () => {
    const { cms, client } = await signedIn();
    const c = await cms.create("categories", { slug: "news" });
    expect(await client.previewUrl("posts", { slug: "hello", category: c.id })).toBe("/news/hello");
    expect(await client.previewUrl("posts", { slug: "hello" })).toBeNull();

    const p = await cms.create("posts", { slug: "hello" });
    expect(await client.previewUrl("notes", { post: p.id })).toBe("/notes/hello");
    expect(await client.previewUrl("notes", {})).toBeNull();

    expect(await client.previewUrl("linked", { slug: "a" })).toBe("/linked/a");
    expect(await client.previewGlobalUrl("linkedGlobal", {})).toBe("/linked");
    expect(await client.previewGlobalUrl("home", { title: "x" })).toBe("/");

    expect(await status(client.previewUrl("plain", {}))).toBe(404);
    expect(await status(client.previewGlobalUrl("plainGlobal", {}))).toBe(404);
    expect(await status(client.previewUrl("missing" as never, {}))).toBe(404);
  });

  it("answers 401 without a session", async () => {
    const { client } = setup(defineCms(options));
    expect(await status(client.previewUrl("posts", { slug: "a" }))).toBe(401);
    expect(await status(client.previewGlobalUrl("home", {}))).toBe(401);
  });

  it("rejects a `site` that is not an http(s) URL", () => {
    expect(() => defineCms({ ...options, site: "/blog" })).toThrow("`site` MUST be an http(s) URL");
    expect(() => defineCms({ ...options, site: "ftp://x.com" })).toThrow("`site` MUST be");
  });
});

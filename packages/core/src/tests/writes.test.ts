import { beforeEach, describe, expect, it } from "vitest";
import { defineCms, ValidationError } from "../index.ts";
import {
  admin,
  base,
  fresh,
  localized,
  origin,
  published,
  status,
  unpublished,
  type Env,
  testDatabase,
} from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("writes", () => {
  it("need a session", async () => {
    expect(await status(client.create("posts", { title: "Hi" }))).toBe(401);
    expect(await status(client.setGlobal("site", { name: "Site" }))).toBe(401);
    expect(await status(client.getSchema())).toBe(401);
  });

  it("reject cross-origin form posts", async () => {
    await client.signUp(admin);
    const res = await cms.fetch(
      new Request(`${origin}/_tenon/collections/posts`, {
        method: "POST",
        headers: {
          origin: "http://evil.test",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "title=Hi",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("create, update and delete a document with a group, and set a global", async () => {
    await client.signUp(admin);
    const post = await client.create("posts", {
      title: "Hi",
      views: 1,
      extra: "x",
      seo: { title: "S", noindex: true, extra: 1 },
    } as never);
    expect(post).toMatchObject({ title: "Hi", views: 1, seo: { title: "S", noindex: true } });
    expect(post).not.toHaveProperty("extra");
    expect(post.seo).not.toHaveProperty("extra");
    expect(await client.update("posts", post.id, { title: "Hello" })).toMatchObject({
      id: post.id,
      title: "Hello",
      views: 1,
    });
    await client.update("posts", post.id, { views: null });
    expect(await client.findById("posts", post.id)).toMatchObject({ title: "Hello", views: null });
    expect((await client.findById("posts", post.id)).seo).toEqual({ title: "S", noindex: true });
    await client.delete("posts", post.id);
    expect(await status(client.findById("posts", post.id))).toBe(404);

    expect(await client.getGlobal("site")).toEqual(unpublished);
    await client.setGlobal("site", { name: "Site" });
    expect(await client.getGlobal("site")).toEqual({ name: "Site", ...published });
  });

  it("update only the top-level keys that are sent", async () => {
    const post = await cms.create("posts", {
      title: "Hi",
      views: 1,
      seo: { title: "S", noindex: true },
    });
    const updated = await cms.update("posts", post.id, { views: 2, seo: { title: "T" } });
    expect(updated).toMatchObject({ title: "Hi", views: 2, seo: { title: "T" } });
    expect(updated?.seo).not.toHaveProperty("noindex");
  });

  it("set only the global keys that are sent", async () => {
    const cms = defineCms({
      ...base,
      globals: { site: { fields: { name: { type: "text" }, tagline: { type: "text" } } } },
    });
    await cms.setGlobal("site", { name: "Site", tagline: "T" });
    await cms.setGlobal("site", { tagline: "U" });
    expect(await cms.getGlobal("site")).toEqual({ name: "Site", tagline: "U", ...published });
  });
});

describe("slug from", () => {
  const make = () =>
    defineCms({
      collections: {
        posts: {
          fields: {
            title: { type: "text", required: true },
            slug: { type: "slug", from: "title", required: true },
            meta: {
              type: "group",
              fields: { name: { type: "text" }, handle: { type: "slug", from: "name" } },
            },
          },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });

  it("fills an empty slug from its source field", async () => {
    const cms = make();
    expect((await cms.create("posts", { title: "Über uns" })).slug).toBe("uber-uns");
    expect((await cms.create("posts", { title: "Hi", slug: "" })).slug).toBe("hi");
    expect((await cms.create("posts", { title: "Hi", meta: { name: "A B" } })).meta).toEqual({
      name: "A B",
      handle: "a-b",
    });
  });

  it("keeps a given or stored slug", async () => {
    const cms = make();
    const post = await cms.create("posts", { title: "Hi", slug: "custom" });
    expect(post.slug).toBe("custom");
    expect((await cms.update("posts", post.id, { title: "New" }))?.slug).toBe("custom");
    expect((await cms.update("posts", post.id, { slug: null }))?.slug).toBe("new");
  });
});

describe("validation", () => {
  it("local API rejects invalid data with ValidationError", async () => {
    const error = await cms.create("posts", { title: "" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ errors: { title: expect.any(String) } });
    await expect(cms.setGlobal("site", { name: 1 } as never)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await cms.find("posts")).toEqual([]);
  });

  it("HTTP returns field errors", async () => {
    await client.signUp(admin);
    const json = { method: "POST", headers: { "content-type": "application/json" } };
    const res = await fetchWithSession("/collections/posts", {
      ...json,
      body: JSON.stringify({ title: "", seo: { noindex: "x" } }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      message: expect.any(String),
      errors: { title: expect.any(String), "seo.noindex": expect.any(String) },
    });
    const error = await client.create("posts", { title: "" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, message: expect.stringMatching(/./) });
  });
});

it("preserves unlocalized fields named like locale metadata across updates", async () => {
  const cms = defineCms({
    ...base,
    media: false,
    settings: false,
    collections: {
      pages: {
        fields: {
          locale: { type: "text" },
          locales: { type: "text" },
          sharedDraft: { type: "boolean" },
        },
      },
    },
  });
  const input = { locale: "custom", locales: "all", sharedDraft: true };
  const doc = await cms.create("pages", input);
  expect(await cms.update("pages", doc.id, {})).toMatchObject(input);
});

describe("duplicate", () => {
  it("copies a document into a new draft with (copy) in the title", async () => {
    const post = await cms.create("posts", { title: "Hello", views: 3, seo: { title: "S" } });
    expect(await status(client.duplicate("posts", post.id))).toBe(401);
    await client.signUp(admin);

    const copy = await client.duplicate("posts", post.id);
    expect(copy).toMatchObject({ title: "Hello (copy)", views: 3, seo: { title: "S" } });
    expect(copy).toMatchObject({ publishedAt: null, hasDraft: true });
    expect(copy.id).not.toBe(post.id);
    expect(await cms.findById("posts", post.id)).toMatchObject({ title: "Hello" });
  });

  it("answers 404 for a missing document", async () => {
    await client.signUp(admin);
    expect(await status(client.duplicate("posts", "missing"))).toBe(404);
  });

  it("copies every locale and suffixes unique fields until the value is free", async () => {
    const { cms, client } = localized();
    const post = await cms.create("posts", { title: "Hello", slug: "hello", views: 1 });
    await cms.update("posts", post.id, { title: "Hallo", slug: "hallo" }, {
      locale: "de",
    } as never);
    await client.signUp(admin);

    const first = await client.duplicate("posts", post.id);
    const read = (id: string, locale: string) =>
      cms.withDrafts().findById("posts", id, { locale, fallback: false } as never);
    expect(await read(first.id, "en")).toMatchObject({ title: "Hello (copy)", slug: "hello-copy" });
    expect(await read(first.id, "de")).toMatchObject({
      title: "Hallo (copy)",
      slug: "hallo-copy",
      views: 1,
      hasDraft: true,
    });

    const second = await client.duplicate("posts", post.id);
    expect(await read(second.id, "en")).toMatchObject({ slug: "hello-copy-2" });
  });

  it("saves the copy without drafts", async () => {
    const { cms, client } = localized();
    const note = await cms.create("notes", { text: "Hello" });
    await client.signUp(admin);
    expect(await client.duplicate("notes", note.id)).toMatchObject({
      text: "Hello (copy)",
      hasDraft: false,
    });
  });
});

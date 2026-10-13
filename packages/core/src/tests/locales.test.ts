import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { ValidationError } from "../index.ts";
import type { LocalApi } from "../cms/api/local-api.ts";
import type { HookArgs } from "../schema/hooks/index.ts";
import { page } from "../presets/index.ts";
import { admin, fresh, localized, seeded, tmpDb } from "./setup.ts";

const seen: Array<[string, string | undefined]> = [];
const spy =
  (tag: string) =>
  ({ locale }: HookArgs) =>
    void seen.push([tag, locale]);

describe("locale scope", () => {
  it("throws a ValidationError for an unknown locale", async () => {
    const { cms } = localized();
    const bad = { locale: "fr" } as never;
    const error = new ValidationError({ locale: "Unknown locale" });
    await expect(cms.find("posts", bad)).rejects.toEqual(error);
    await expect(cms.findOne("posts", bad)).rejects.toEqual(error);
    await expect(cms.findById("posts", "x", bad)).rejects.toEqual(error);
    await expect(cms.create("posts", { title: "a" }, bad)).rejects.toEqual(error);
    await expect(cms.getGlobal("site", bad)).rejects.toEqual(error);
    await expect(cms.setGlobal("site", {}, bad)).rejects.toEqual(error);
  });

  it("throws for a locale without localization", async () => {
    const { cms } = fresh();
    await expect(cms.find("posts", { locale: "en" } as never)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("gives hooks the default locale, or the option", async () => {
    seen.length = 0;
    const { cms } = localized({ collections: { posts: { hooks: { beforeChange: [spy("w")] } } } });
    await cms.create("posts", { title: "a" });
    await cms.create("posts", { title: "b" }, { locale: "de" } as never);
    expect(seen).toEqual([
      ["w", "en"],
      ["w", "de"],
    ]);
  });

  it("gives read hooks the option as locale", async () => {
    seen.length = 0;
    const { cms } = localized({
      collections: { posts: { hooks: { beforeRead: [spy("r")] } } },
    });
    await cms.find("posts", { locale: "de" } as never);
    expect(seen).toEqual([["r", "de"]]);
  });

  it("lets nested calls inherit the locale, and an explicit option override it", async () => {
    seen.length = 0;
    const { cms } = localized({
      collections: {
        posts: {
          hooks: {
            beforeRead: [spy("read")],
            afterChange: [
              async ({ cms, locale }: HookArgs) => {
                if (locale !== "de") return;
                await cms.find("posts");
                await cms.find("posts", { locale: "en" });
              },
            ],
          },
        },
      },
    });
    await cms.create("posts", { title: "a" }, { locale: "de" } as never);
    expect(seen).toEqual([
      ["read", "de"],
      ["read", "en"],
    ]);
  });

  it("gives global hooks the locale", async () => {
    seen.length = 0;
    const { cms } = localized({
      globals: {
        site: {
          localized: true,
          fields: { tagline: { type: "text" } },
          hooks: { beforeChange: [spy("g")] },
        },
      },
    });
    await cms.setGlobal("site", { tagline: "x" }, { locale: "de" } as never);
    expect(seen).toEqual([["g", "de"]]);
  });
});

describe("localized fields moving between instances", () => {
  const instance = (url: string, localized: boolean) =>
    defineCms({
      collections: {
        posts: {
          localized,
          fields: {
            title: { type: "text" },
            body: localized ? { type: "text", localized: false } : { type: "text" },
          },
        },
      },
      ...(localized && { localization: { locales: ["en", "de"], defaultLocale: "en" } }),
      database: { url },
      secret: "x".repeat(32),
      media: false,
    });
  const query = async (url: string, sql: string) => {
    const db = createClient({ url });
    try {
      return (await db.execute(sql)).rows.map((r) => ({ ...r }));
    } finally {
      db.close();
    }
  };

  it("moves a field to the default locale's row when it becomes localized", async () => {
    const url = tmpDb();
    const before = instance(url, false);
    const post = await before.create("posts", { title: "Hi", body: "Text" });
    expect(await query(url, "SELECT * FROM cms_schema_state WHERE name = 'posts'")).toEqual([
      { kind: "collection", name: "posts", localized: null },
    ]);

    // Opening the second instance runs the sync on its first DB access.
    await instance(url, true).find("posts");

    const docs = await query(url, `SELECT data FROM cms_documents WHERE id = '${post.id}'`);
    expect(JSON.parse(docs[0].data as string)).toEqual({ body: "Text" });
    const rows = await query(url, "SELECT document_id, locale, data FROM cms_document_locales");
    expect(rows).toEqual([
      { document_id: post.id, locale: "en", data: JSON.stringify({ title: "Hi" }) },
    ]);
  });
});

const de = { locale: "de" } as never;
const strict = { locale: "de", fallback: false } as never;
const ids = (docs: unknown) => (docs as Array<{ id: string }>).map((d) => d.id);

async function posts() {
  const s = seeded();
  await s.doc(
    "p1",
    { data: { views: 3 } },
    {
      en: {
        data: {
          title: "Hello",
          slug: "hello",
          body: "Body",
          secret: "s-en",
          seo: { description: "EN seo" },
        },
      },
      de: { data: { title: "Hallo", slug: "hallo", secret: "s-de" } },
    },
  );
  await s.doc("p2", { data: { views: 1 } }, { en: { data: { title: "English only" } } });
  await s.doc(
    "p3",
    { data: {} },
    {
      en: { data: { title: "Published" } },
      de: { data: {}, draft: { title: "Entwurf" }, published: false },
    },
  );
  return s;
}

describe("locale reads", () => {
  it("reads the requested locale with the shared fields", async () => {
    const { cms } = await posts();
    expect(await cms.findById("posts", "p1", de)).toMatchObject({
      title: "Hallo",
      slug: "hallo",
      views: 3,
    });
    expect(await cms.findById("posts", "p1")).toMatchObject({ title: "Hello", views: 3 });
  });

  it("falls back to the default locale for a missing value, or reads null without fallback", async () => {
    const { cms } = await posts();
    expect(await cms.findById("posts", "p1", de)).toMatchObject({
      body: "Body",
      seo: { description: "EN seo" },
    });
    expect(await cms.findById("posts", "p1", strict)).toMatchObject({
      title: "Hallo",
      body: null,
      seo: null,
    });
  });

  it("shows an English-only post in de with fallback, and hides it without", async () => {
    const { cms } = await posts();
    expect(ids(await cms.find("posts", de))).toContain("p2");
    expect(ids(await cms.find("posts", strict))).not.toContain("p2");
    expect(await cms.findById("posts", "p2", strict)).toBeUndefined();
    expect(await cms.findById("posts", "p2", de)).toMatchObject({ title: "English only" });
  });

  it("hides an unpublished locale row, and the drafts perspective shows it", async () => {
    const { cms } = await posts();
    expect(await cms.findById("posts", "p3", de)).toMatchObject({ title: "Published" });
    expect(await cms.findById("posts", "p3", strict)).toBeUndefined();
    const drafts = cms.withDrafts();
    expect(await drafts.findById("posts", "p3", strict)).toMatchObject({ title: "Entwurf" });
    expect(await drafts.findById("posts", "p2", strict)).toMatchObject({ title: null });
  });

  it("filters localized fields by the value a read returns", async () => {
    const { cms } = await posts();
    const where = (title: string, more: object = {}) =>
      cms.find("posts", { where: { title }, locale: "de", ...more } as never);
    expect(ids(await where("Hallo"))).toEqual(["p1"]);
    expect(ids(await where("English only"))).toEqual(["p2"]);
    expect(await where("English only", { fallback: false })).toEqual([]);
    expect(ids(await cms.find("posts", { where: { views: 3 }, locale: "de" } as never))).toEqual([
      "p1",
    ]);
  });

  it("adds locale and locales metadata, and selects them", async () => {
    const { cms } = await posts();
    expect(await cms.findById("posts", "p1", de)).toMatchObject({
      locale: "de",
      locales: ["en", "de"],
    });
    expect(await cms.findById("posts", "p3", de)).toMatchObject({ locales: ["en"] });
    expect(await cms.withDrafts().findById("posts", "p3", de)).toMatchObject({
      locales: ["en", "de"],
    });
    const select = { locale: true, locales: true };
    expect(await cms.findById("posts", "p1", { locale: "de", select } as never)).toEqual({
      id: "p1",
      locale: "de",
      locales: ["en", "de"],
    });
  });

  it("derives publishedAt and hasDraft from the requested row", async () => {
    const { cms } = await posts();
    const drafts = cms.withDrafts();
    expect(await drafts.findById("posts", "p3", strict)).toMatchObject({
      publishedAt: null,
      hasDraft: true,
    });
    expect(await drafts.findById("posts", "p3", { locale: "en" } as never)).toMatchObject({
      publishedAt: expect.any(String),
      hasDraft: false,
    });
    expect(await drafts.findById("posts", "p2", de)).toMatchObject({
      publishedAt: expect.any(String),
      hasDraft: false,
    });
  });

  it("keeps an unlocalized collection unchanged", async () => {
    const { cms } = await posts();
    await cms.create("authors", { name: "Ann" });
    const [author] = (await cms.find("authors", de)) as object[];
    expect(author).toMatchObject({ name: "Ann" });
    expect(author).not.toHaveProperty("locale");
    expect(author).not.toHaveProperty("locales");
    await expect(cms.find("authors", { select: { locale: true } } as never)).rejects.toThrow(
      /Invalid select/,
    );
  });

  it("reads a global per locale", async () => {
    const s = seeded();
    await s.global(
      "site",
      { data: { email: "a@b.co" } },
      { en: { data: { tagline: "Hi" } }, de: { data: { tagline: "Hallo" } } },
    );
    expect(await s.cms.getGlobal("site")).toMatchObject({ tagline: "Hi", email: "a@b.co" });
    expect(await s.cms.getGlobal("site", de)).toMatchObject({ tagline: "Hallo", email: "a@b.co" });
  });

  it("applies fallback and perspective to a global's locale rows", async () => {
    const s = seeded();
    await s.global(
      "site",
      { data: { email: "a@b.co" } },
      {
        en: { data: { tagline: "Hi" } },
        de: { data: {}, draft: { tagline: "Entwurf" }, published: false },
      },
    );
    expect(await s.cms.getGlobal("site", de)).toMatchObject({ tagline: "Hi" });
    expect(await s.cms.getGlobal("site", strict)).not.toHaveProperty("tagline");
    expect(await s.cms.withDrafts().getGlobal("site", strict)).toMatchObject({
      tagline: "Entwurf",
    });
  });
});

describe("locale population", () => {
  const instance = () =>
    seeded({
      collections: {
        posts: {
          fields: {
            title: { type: "text" },
            topic: { type: "relation", collection: "topics", localized: false },
          },
        },
        topics: {
          localized: true,
          fields: {
            name: { type: "text" },
            posts: { type: "join", collection: "posts", on: "topic" },
          },
        },
      },
    });

  async function seed() {
    const s = instance();
    await s.doc(
      "t1",
      { data: {} },
      { en: { data: { name: "Cats" } }, de: { data: { name: "Katzen" } } },
      "topics",
    );
    await s.doc("t2", { data: {} }, { en: { data: { name: "Dogs" } } }, "topics");
    await s.doc(
      "p1",
      { data: { topic: "t1" } },
      { en: { data: { title: "A" } }, de: { data: { title: "B" } } },
    );
    await s.doc("p2", { data: { topic: "t2" } }, { en: { data: { title: "C" } } });
    return s.cms as any;
  }

  it("reads relation targets in the scope's locale", async () => {
    const cms = await seed();
    const read = (id: string, o: object) =>
      cms.findById("posts", id, { populate: { topic: true }, locale: "de", ...o });
    expect((await read("p1", {})).topic).toMatchObject({ name: "Katzen", locale: "de" });
    expect((await read("p2", {})).topic).toMatchObject({ name: "Dogs" });
    expect((await read("p2", { fallback: false })) ?? null).toBeNull();
  });

  it("selects locale metadata of a populated localized target", async () => {
    const cms = await seed();
    const post = await cms.findById("posts", "p1", {
      populate: { topic: true },
      locale: "de",
      select: { topic: { name: true, locale: true } },
    });
    expect(post.topic).toEqual({ id: "t1", name: "Katzen", locale: "de" });
  });

  it("reads joined documents in the scope's locale", async () => {
    const cms = await seed();
    const topic = await cms.findById("topics", "t1", { populate: { posts: true }, locale: "de" });
    expect(topic.posts).toMatchObject([{ id: "p1", title: "B" }]);
    const dogs = await cms.findById("topics", "t2", { populate: { posts: true }, locale: "de" });
    expect(dogs.posts).toMatchObject([{ id: "p2", title: "C" }]);
    const none = await cms.findById("topics", "t2", {
      populate: { posts: true },
      locale: "de",
      fallback: false,
    });
    expect(none).toBeUndefined();
  });
});

describe("locale reads over HTTP", () => {
  it("reads ?locale= and ?fallback=, and strips private fields for the public", async () => {
    const s = seeded();
    await s.doc(
      "p1",
      { data: {} },
      {
        en: { data: { title: "Hello", body: "Body", secret: "s-en" } },
        de: { data: { title: "Hallo", secret: "s-de" } },
      },
    );
    const get = async (path: string) => (await (await s.fetchWithSession(path)).json()) as any[];

    expect(await get("/collections/posts?locale=de")).toMatchObject([
      { title: "Hallo", body: "Body", locale: "de" },
    ]);
    const list = await get("/collections/posts?locale=de&fallback=false");
    expect(list).toMatchObject([{ title: "Hallo", body: null }]);
    expect(list[0]).not.toHaveProperty("secret");

    const one = await s.fetchWithSession("/collections/posts/p1?locale=de&fallback=false");
    expect(await one.json()).toMatchObject({ title: "Hallo", body: null });

    expect(await get("/collections/posts?locale=de&title=Hallo")).toHaveLength(1);
    expect(await get("/collections/posts?alternates=true")).toHaveLength(1);
  });

  it("shows private fields to a session", async () => {
    const s = seeded();
    await s.doc("p1", { data: {} }, { en: { data: { title: "Hello", secret: "s-en" } } });
    await s.client.signUp(admin);
    const [doc] = (await (await s.fetchWithSession("/collections/posts")).json()) as any[];
    expect(doc.secret).toBe("s-en");
  });

  it("answers 400 for an unknown locale", async () => {
    const s = seeded();
    await s.doc("p1", { data: {} }, { en: { data: { title: "Hello" } } });
    for (const path of [
      "/collections/posts?locale=fr",
      "/collections/posts/p1?locale=fr",
      "/globals/site?locale=fr",
    ]) {
      const res = await s.fetchWithSession(path);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ errors: { locale: "Unknown locale" } });
    }
  });

  it("reads a global with ?locale=", async () => {
    const s = seeded();
    await s.global(
      "site",
      { data: {} },
      { en: { data: { tagline: "Hi" } }, de: { data: { tagline: "Hallo" } } },
    );
    const res = await s.fetchWithSession("/globals/site?locale=de");
    expect(await res.json()).toMatchObject({ tagline: "Hallo" });
  });
});

describe("permalink with routing", () => {
  const routed = (routing: object | false, extra: object = {}) =>
    localized({
      collections: { posts: { permalink: "/posts/{slug}", ...extra } },
      globals: {
        site: {
          localized: true,
          permalink: "/site",
          fields: { tagline: { type: "text" } },
        },
      },
      localization: { locales: ["en", "de"], defaultLocale: "en", routing },
    });
  const url = async (
    s: ReturnType<typeof routed>,
    path: string,
    body: object = { slug: "hello" },
  ) => {
    const res = await s.fetchWithSession(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.status === 200 ? ((await res.json()) as { url: string | null }).url : res.status;
  };

  it("prefixes the permalink with the locale of ?locale=", async () => {
    const s = routed({ prefix: "except-default" });
    await s.client.signUp(admin);
    expect(await url(s, "/collections/posts/preview-url")).toBe("/posts/hello");
    expect(await url(s, "/collections/posts/preview-url?locale=en")).toBe("/posts/hello");
    expect(await url(s, "/collections/posts/preview-url?locale=de")).toBe("/de/posts/hello");
    expect(await url(s, "/globals/site/preview-url?locale=de", {})).toBe("/de/site");
  });

  it("prefixes every locale with prefix always", async () => {
    const s = routed({ prefix: "always" });
    await s.client.signUp(admin);
    expect(await url(s, "/collections/posts/preview-url")).toBe("/en/posts/hello");
    expect(await url(s, "/collections/posts/preview-url?locale=de")).toBe("/de/posts/hello");
  });

  it("uses an explicit preview as it is", async () => {
    const s = routed({ prefix: "except-default" }, { preview: "/draft/{slug}" });
    await s.client.signUp(admin);
    expect(await url(s, "/collections/posts/preview-url?locale=de")).toBe("/draft/hello");
  });

  it("answers 400 for an unknown locale", async () => {
    const s = routed({ prefix: "except-default" });
    await s.client.signUp(admin);
    expect(await url(s, "/collections/posts/preview-url?locale=fr")).toBe(400);
    expect(await url(s, "/globals/site/preview-url?locale=fr", {})).toBe(400);
  });

  it("fills {locale} without routing and adds no prefix", async () => {
    const s = routed(false, { permalink: "/{locale}/blog/{slug}" });
    await s.client.signUp(admin);
    expect(await url(s, "/collections/posts/preview-url?locale=de")).toBe("/de/blog/hello");
    expect(await url(s, "/collections/posts/preview-url")).toBe("/en/blog/hello");
  });

  it("passes the locale to a permalink function", async () => {
    const s = routed(false, {
      permalink: (_: unknown, { locale }: { locale?: string }) => `/x/${locale}`,
    });
    await s.client.signUp(admin);
    expect(await url(s, "/collections/posts/preview-url?locale=de")).toBe("/x/de");
  });

  it("rejects {locale} with routing", () => {
    expect(() => routed({ prefix: "always" }, { permalink: "/{locale}/{slug}" })).toThrow(
      /names unknown field "locale"/,
    );
  });
});

describe("alternates", () => {
  const withPermalink = (localization: object = { locales: ["en", "de"], defaultLocale: "en" }) =>
    seeded({ collections: { posts: { permalink: "/posts/{slug}" } }, localization });

  async function seedPosts(s: ReturnType<typeof withPermalink>) {
    await s.doc(
      "p1",
      { data: {} },
      {
        en: { data: { title: "Hello", slug: "hello" } },
        de: { data: { title: "Hallo", slug: "hallo" } },
      },
    );
    await s.doc(
      "p2",
      { data: {} },
      {
        en: { data: { title: "Two", slug: "two" } },
        de: { data: {}, draft: { title: "Zwei", slug: "zwei" }, published: false },
      },
    );
    await s.doc("p3", { data: {} }, { de: { data: { title: "Nur", slug: "nur" } } });
    await s.doc(
      "p4",
      { data: {} },
      { en: { data: { title: "Four", slug: "four" }, published: false } },
    );
    return s;
  }
  const by = async (docs: Promise<any[]>) =>
    Object.fromEntries((await docs).map((d: any) => [d.id, d.alternates]));
  const opts = { alternates: true, fallback: false } as never;
  const one = (s: { cms: any }, id: string, o: object = {}): Promise<any> =>
    s.cms.findById("posts", id, o);

  it("lists the published locales with x-default", async () => {
    const s = await seedPosts(withPermalink());
    expect(await s.cms.findById("posts", "p1", { alternates: true } as never)).toMatchObject({
      alternates: { en: "/posts/hello", de: "/de/posts/hallo", "x-default": "/posts/hello" },
    });
  });

  it("omits an unpublished locale", async () => {
    const s = await seedPosts(withPermalink());
    expect((await one(s, "p2", opts)).alternates).toEqual({
      en: "/posts/two",
      "x-default": "/posts/two",
    });
  });

  it("omits x-default without a published default locale", async () => {
    const s = await seedPosts(withPermalink());
    const read = await one(s, "p3", { locale: "de", alternates: true });
    expect(read.alternates).toEqual({ de: "/de/posts/nur" });
  });

  it("resolves a list in one batch per locale", async () => {
    let calls = 0;
    const s = seeded({
      collections: {
        posts: { permalink: "/posts/{slug}", hooks: { afterRead: [() => void calls++] } },
      },
    });
    await seedPosts(s as never);
    calls = 0;
    const docs = await s.cms.find("posts", opts);
    expect(docs).toHaveLength(2);
    expect(await by(Promise.resolve(docs))).toMatchObject({
      p1: { en: "/posts/hello", de: "/de/posts/hallo" },
      p2: { en: "/posts/two" },
    });
    // The read itself plus one batch per locale.
    expect(calls).toBe(3);
  });

  it("describes published URLs in the drafts perspective", async () => {
    const s = await seedPosts(withPermalink());
    const doc = await one({ cms: s.cms.withDrafts() }, "p2", { alternates: true });
    expect(doc.alternates).toEqual({ en: "/posts/two", "x-default": "/posts/two" });
    expect(doc.locales).toEqual(["en", "de"]);
  });

  it("adds nothing without permalink or alternates: true", async () => {
    const plain = seeded();
    await plain.doc("p1", { data: {} }, { en: { data: { title: "Hello", slug: "hello" } } });
    expect(
      await plain.cms.findById("posts", "p1", { alternates: true } as never),
    ).not.toHaveProperty("alternates");
    const s = await seedPosts(withPermalink());
    expect(await s.cms.findById("posts", "p1")).not.toHaveProperty("alternates");
  });

  it("adds nothing to an unlocalized collection", async () => {
    const s = seeded({
      collections: {
        authors: { permalink: "/authors/{name}", fields: { name: { type: "text" } } },
      },
    });
    await s.client.signUp(admin);
    const a = await s.cms.create("authors", { name: "Ann" });
    expect(await s.cms.findById("authors", a.id, { alternates: true } as never)).not.toHaveProperty(
      "alternates",
    );
  });

  it("follows select", async () => {
    const s = await seedPosts(withPermalink());
    const only = await s.cms.findById("posts", "p1", {
      alternates: true,
      select: { title: true },
    } as never);
    expect(only).toEqual({ id: "p1", title: "Hello" });
    const picked = await s.cms.findById("posts", "p1", {
      alternates: true,
      select: { alternates: true },
    } as never);
    expect(picked).toEqual({
      id: "p1",
      alternates: { en: "/posts/hello", de: "/de/posts/hallo", "x-default": "/posts/hello" },
    });
  });

  it("prefixes every locale with prefix always", async () => {
    const s = await seedPosts(
      withPermalink({ locales: ["en", "de"], defaultLocale: "en", routing: { prefix: "always" } }),
    );
    expect((await one(s, "p1", { alternates: true })).alternates).toEqual({
      en: "/en/posts/hello",
      de: "/de/posts/hallo",
      "x-default": "/en/posts/hello",
    });
  });

  it("fills {locale} without routing", async () => {
    const s = seeded({
      collections: { posts: { permalink: "/{locale}/blog/{slug}" } },
      localization: { locales: ["en", "de"], defaultLocale: "en", routing: false },
    });
    await s.doc(
      "p1",
      { data: {} },
      {
        en: { data: { title: "Hello", slug: "hello" } },
        de: { data: { title: "Hallo", slug: "hallo" } },
      },
    );
    expect((await one(s, "p1", { alternates: true })).alternates).toEqual({
      en: "/en/blog/hello",
      de: "/de/blog/hallo",
      "x-default": "/en/blog/hello",
    });
  });

  it("reads a relation of the permalink in the locale of the alternate", async () => {
    const s = seeded({
      collections: {
        posts: { permalink: "/{related.name}/{slug}" },
      },
    });
    await s.client.signUp(admin);
    const author = await s.cms.create("authors", { name: "ann" });
    await s.doc(
      "p1",
      { data: {} },
      {
        en: { data: { title: "Hello", slug: "hello", related: author.id } },
        de: { data: { title: "Hallo", slug: "hallo", related: author.id } },
      },
    );
    expect((await one(s, "p1", { alternates: true })).alternates).toEqual({
      en: "/ann/hello",
      de: "/de/ann/hallo",
      "x-default": "/ann/hello",
    });
  });

  it("is served for ?alternates=true", async () => {
    const s = await seedPosts(withPermalink());
    const list = (await (
      await s.fetchWithSession("/collections/posts?alternates=true&locale=de")
    ).json()) as any[];
    expect(list.find((d) => d.id === "p1")).toMatchObject({
      locale: "de",
      alternates: { en: "/posts/hello", de: "/de/posts/hallo", "x-default": "/posts/hello" },
    });
    const one = await s.fetchWithSession("/collections/posts/p1?alternates=true");
    expect(await one.json()).toMatchObject({ alternates: { de: "/de/posts/hallo" } });
  });
});

describe("global metadata", () => {
  async function site() {
    const s = seeded({
      globals: {
        site: { localized: true, fields: { tagline: { type: "text" } } },
        plain: { fields: { note: { type: "text" } } },
      },
    });
    await s.global(
      "site",
      { data: {} },
      {
        en: { data: { tagline: "Hi" } },
        de: { data: { tagline: "Hallo" }, published: false },
      },
    );
    return s;
  }

  it("lists the published locales in the published perspective", async () => {
    const s = await site();
    expect(await s.cms.getGlobal("site")).toMatchObject({ locale: "en", locales: ["en"] });
    expect(await s.cms.getGlobal("site", { locale: "de" } as never)).toMatchObject({
      locale: "de",
      locales: ["en"],
    });
  });

  it("lists every locale with a row in the drafts perspective", async () => {
    const s = await site();
    expect(await s.cms.withDrafts().getGlobal("site", { locale: "de" } as never)).toMatchObject({
      locale: "de",
      locales: ["en", "de"],
    });
  });

  it("has an empty list for a global without rows", async () => {
    const s = seeded();
    await s.client.signUp(admin);
    expect(await s.cms.withDrafts().getGlobal("site")).toMatchObject({ locale: "en", locales: [] });
  });

  it("adds nothing to an unlocalized global", async () => {
    const s = await site();
    const plain = await s.cms.getGlobal("plain" as never);
    expect(plain).not.toHaveProperty("locale");
    expect(plain).not.toHaveProperty("locales");
  });

  it("follows select", async () => {
    const s = await site();
    expect(await s.cms.getGlobal("site", { select: { locales: true } } as never)).toEqual({
      locales: ["en"],
    });
    expect(await s.cms.getGlobal("site", { select: { tagline: true } } as never)).toEqual({
      tagline: "Hi",
    });
    await expect(
      s.cms.getGlobal("plain" as never, { select: { locale: true } } as never),
    ).rejects.toThrow(/Invalid select/);
  });

  it("is served over HTTP", async () => {
    const s = await site();
    const res = await s.fetchWithSession("/globals/site?locale=de&select=locale,locales");
    expect(await res.json()).toEqual({ locale: "de", locales: ["en"] });
  });
});

describe("writes", () => {
  const en = { locale: "en" } as never;
  const draftDe = { draft: true, locale: "de" } as never;
  const read = (cms: any, id: string, options: object = {}) =>
    cms.withDrafts().findById("posts", id, { fallback: false, ...options });

  async function published() {
    const s = localized();
    const post = await s.cms.create("posts", { title: "Hello", views: 1 });
    return { ...s, id: post.id as string };
  }

  it("saves a draft in de without touching en", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, draftDe);

    expect(await cms.findById("posts", id)).toMatchObject({ title: "Hello", hasDraft: false });
    expect(await read(cms, id, de)).toMatchObject({ title: "Hallo", hasDraft: true });
    expect(await read(cms, id, en)).toMatchObject({ title: "Hello", hasDraft: false });
    expect(await cms.findById("posts", id, de)).toMatchObject({ title: "Hello" });
    expect(await cms.findById("posts", id, strict)).toBeUndefined();
  });

  it("publishes de by publishing it", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, draftDe);
    const doc = await cms.publish("posts", id, de);

    expect(doc).toMatchObject({ title: "Hallo", locale: "de", hasDraft: false });
    expect(await cms.findById("posts", id, strict)).toMatchObject({
      title: "Hallo",
      locales: ["en", "de"],
    });
    expect(await cms.findById("posts", id)).toMatchObject({ title: "Hello" });
  });

  it("publishes a shared field saved as a draft in de by publishing en", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { views: 5 }, draftDe);
    expect(await cms.findById("posts", id)).toMatchObject({ views: 1 });
    expect(await read(cms, id, en)).toMatchObject({ views: 5 });

    await cms.publish("posts", id);
    expect(await cms.findById("posts", id)).toMatchObject({ views: 5, title: "Hello" });
    expect(await read(cms, id, de)).toMatchObject({ hasDraft: true });
  });

  it("checks required for the published locale only", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { views: 2 }, draftDe);

    await cms.publish("posts", id);
    await expect(cms.publish("posts", id, de)).rejects.toMatchObject({
      errors: { title: expect.any(String) },
    });
    await expect(cms.update("posts", id, { views: 3 }, de)).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates a document in de", async () => {
    const { cms } = localized();
    const post = await cms.create("posts", { title: "Hallo" }, draftDe);
    expect(post).toMatchObject({ title: "Hallo", locale: "de", publishedAt: null });

    const drafts = cms.withDrafts();
    expect(await drafts.findById("posts", post.id, strict)).toMatchObject({
      title: "Hallo",
      locales: ["de"],
    });
    expect(await cms.find("posts", strict)).toEqual([]);

    const live = await cms.create("posts", { title: "Direkt" }, de);
    expect(await cms.findById("posts", live.id, strict)).toMatchObject({
      title: "Direkt",
      locales: ["de"],
    });
    expect(await cms.findById("posts", live.id)).toBeUndefined();
  });

  it("discards in de: a never-published German row goes, English stays", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, draftDe);

    expect(await cms.discard("posts", id, de)).toBeUndefined();
    expect(await read(cms, id, de)).toMatchObject({ title: null, locales: ["en"] });
    expect(await cms.findById("posts", id)).toMatchObject({ title: "Hello" });
  });

  it("discards in de: a published German row returns to its published version", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, de);
    await cms.update("posts", id, { title: "Neu" }, draftDe);

    expect(await cms.discard("posts", id, de)).toMatchObject({ title: "Hallo", hasDraft: false });
    expect(await read(cms, id, de)).toMatchObject({ title: "Hallo", hasDraft: false });
  });

  it("discards in de: a pending shared draft stays until en is published", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo", views: 9 }, draftDe);
    await cms.discard("posts", id, de);

    expect(await read(cms, id, en)).toMatchObject({ views: 9 });
    expect(await cms.findById("posts", id)).toMatchObject({ views: 1 });
    await cms.publish("posts", id);
    expect(await cms.findById("posts", id)).toMatchObject({ views: 9 });
  });

  it("discards in de: a document created in de is deleted", async () => {
    const { cms } = localized();
    const post = await cms.create("posts", { title: "Hallo" }, draftDe);

    expect(await cms.discard("posts", post.id, de)).toBeUndefined();
    expect(await cms.withDrafts().findById("posts", post.id, strict)).toBeUndefined();
  });

  it("keeps a never-published document while another locale has a row", async () => {
    const { cms } = localized();
    const post = await cms.create("posts", { title: "Hello" }, { draft: true } as never);
    await cms.update("posts", post.id, { title: "Hallo" }, draftDe);

    await cms.discard("posts", post.id, de);
    expect(await cms.withDrafts().findById("posts", post.id, strict)).toMatchObject({
      locales: ["en"],
    });
  });

  it("discards everything with all: true", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, de);
    await cms.update("posts", id, { title: "Entwurf", views: 9 }, draftDe);
    await cms.update("posts", id, { title: "Draft" }, { draft: true } as never);
    await cms.update("posts", id, { title: "Neu" }, { draft: true, locale: "de" } as never);

    const doc = await cms.discard("posts", id, { all: true } as never);
    expect(doc).toMatchObject({ title: "Hello", views: 1, hasDraft: false });
    expect(await read(cms, id, en)).toMatchObject({ title: "Hello", views: 1, hasDraft: false });
    expect(await read(cms, id, de)).toMatchObject({ title: "Hallo", views: 1, hasDraft: false });
  });

  it("deletes never-published rows and documents with all: true", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, draftDe);
    await cms.discard("posts", id, { all: true } as never);
    expect(await read(cms, id)).toMatchObject({ locales: ["en"] });

    const draft = await cms.create("posts", { title: "Hallo" }, draftDe);
    expect(await cms.discard("posts", draft.id, { all: true } as never)).toBeUndefined();
    expect(await read(cms, draft.id)).toBeUndefined();
  });

  it("discards a global per locale and with all: true", async () => {
    const { cms } = localized();
    await cms.setGlobal("site", { tagline: "Hi", email: "a@b.co" });
    await cms.setGlobal("site", { tagline: "Hallo" }, de);
    await cms.setGlobal("site", { tagline: "Entwurf", email: "x@y.co" }, draftDe);
    await cms.setGlobal("site", { tagline: "Draft" }, { draft: true, locale: "en" } as never);
    const drafts = cms.withDrafts();

    expect(await cms.discardGlobal("site", de)).toMatchObject({ tagline: "Hallo" });
    expect(await drafts.getGlobal("site", strict)).toMatchObject({
      tagline: "Hallo",
      email: "x@y.co",
      hasDraft: false,
    });
    expect(await drafts.getGlobal("site", en as never)).toMatchObject({ tagline: "Draft" });

    await cms.discardGlobal("site", { all: true } as never);
    expect(await drafts.getGlobal("site", en as never)).toMatchObject({
      tagline: "Hi",
      email: "a@b.co",
    });
  });

  it("deletes the locale rows with the document", async () => {
    const url = tmpDb();
    const { cms } = localized({ database: { url } });
    const post = await cms.create("posts", { title: "Hello" });
    await cms.update("posts", post.id, { title: "Hallo" }, draftDe);
    const count = async () => {
      const db = createClient({ url });
      try {
        const { rows } = await db.execute("SELECT COUNT(*) AS n FROM cms_document_locales");
        return Number(rows[0].n);
      } finally {
        db.close();
      }
    };
    expect(await count()).toBe(2);

    await cms.delete("posts", post.id);
    expect(await count()).toBe(0);
  });

  it("saves a collection without drafts per locale", async () => {
    const { cms } = localized();
    const note = await cms.create("notes", { text: "Hello" });
    await cms.update("notes", note.id, { text: "Hallo" }, de);

    expect(await cms.findById("notes", note.id)).toMatchObject({ text: "Hello" });
    expect(await cms.findById("notes", note.id, strict)).toMatchObject({
      text: "Hallo",
      locales: ["en", "de"],
    });

    const only = await cms.create("notes", { text: "Nur de" }, de);
    expect(await cms.findById("notes", only.id, strict)).toMatchObject({ text: "Nur de" });
  });

  it("runs afterChange once per locale save", async () => {
    const calls: Array<[string | undefined, unknown]> = [];
    const { cms } = localized({
      collections: {
        posts: {
          hooks: {
            afterChange: [({ doc, locale }: any) => void calls.push([locale, doc.title])],
          },
        },
      },
    });
    const post = await cms.create("posts", { title: "Hello" });
    await cms.update("posts", post.id, { title: "Hallo" }, draftDe);
    await cms.update("posts", post.id, { title: "Hallo!" }, de);

    expect(calls).toEqual([
      ["en", "Hello"],
      ["de", "Hallo!"],
    ]);
  });

  it("leaves other locales alone when an onDelete effect writes a German-only document", async () => {
    const { cms } = localized();
    const author = await cms.create("authors", { name: "Ann" });
    const post = await cms.create("posts", { title: "Hallo", editor: author.id }, {
      locale: "de",
    } as never);

    await cms.delete("authors", author.id);
    expect(await cms.findById("posts", post.id, strict)).toMatchObject({
      title: "Hallo",
      editor: null,
      locales: ["de"],
    });
  });

  it("writes with ?locale= and discards with ?all=true over HTTP", async () => {
    const s = localized();
    await s.client.signUp(admin);
    const send = (method: string, path: string, body?: object) =>
      s.fetchWithSession(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body && JSON.stringify(body),
      });

    const created = await send("POST", "/collections/posts", { title: "Hello", views: 1 });
    const { id } = (await created.json()) as { id: string };
    const draft = await send("PUT", `/collections/posts/${id}/draft?locale=de`, {
      title: "Hallo",
      views: 2,
    });
    expect(await draft.json()).toMatchObject({ title: "Hallo", locale: "de", hasDraft: true });

    const published = await send("POST", `/collections/posts/${id}/publish?locale=de`);
    expect(await published.json()).toMatchObject({ title: "Hallo", locale: "de" });
    expect(await (await send("PUT", `/collections/posts/${id}?locale=fr`, {})).status).toBe(400);

    await send("PUT", `/collections/posts/${id}/draft?locale=de`, { title: "Neu" });
    const discarded = await send("DELETE", `/collections/posts/${id}/draft?all=true`);
    expect(discarded.status).toBe(200);
    const got = await send("GET", `/collections/posts/${id}?locale=de&fallback=false`);
    expect(await got.json()).toMatchObject({ title: "Hallo", hasDraft: false });

    const global = await send("PUT", "/globals/site/draft?locale=de", { tagline: "Hallo" });
    expect(await global.json()).toMatchObject({ tagline: "Hallo", hasDraft: true });
    await send("POST", "/globals/site/publish?locale=de");
    await send("PUT", "/globals/site/draft?locale=de", { tagline: "Neu" });
    await send("DELETE", "/globals/site/draft?all=true");
    const site = await send("GET", "/globals/site?locale=de&fallback=false");
    expect(await site.json()).toMatchObject({ tagline: "Hallo" });
  });
});

describe("nested paths", () => {
  const pages = () => {
    const t = localized({
      collections: {
        pages: {
          localized: true,
          // A shared parent keeps the tree the same in every locale.
          fields: { ...page.fields, parent: { ...page.fields.parent, localized: false } },
          hooks: page.hooks,
        },
      },
    });
    // The helper types only its default collections.
    const cms = t.cms as unknown as LocalApi;
    return { cms, rows: (id: string) => cms.withDrafts().findById("pages", id) };
  };

  it("compares merged paths, so a fallback page keeps its path", async () => {
    const { cms } = pages();
    await cms.create("pages", { title: "Contact", slug: "contact" });
    await expect(
      cms.create("pages", { title: "Kontakt", slug: "contact" }, { locale: "de" }),
    ).rejects.toMatchObject({ errors: { slug: "Already used on this level" } });
  });

  it("updates only children that have a row in the locale", async () => {
    const { cms, rows } = pages();
    const about = await cms.create("pages", { title: "About", slug: "about" });
    const team = await cms.create("pages", { title: "Team", slug: "team", parent: about.id });
    const jobs = await cms.create("pages", { title: "Jobs", slug: "jobs", parent: about.id });
    await cms.update("pages", about.id, { title: "Ueber", slug: "ueber" }, { locale: "de" });
    await cms.update("pages", team.id, { title: "Team", slug: "team" }, { locale: "de" });
    await cms.update("pages", about.id, { slug: "ueber-uns" }, { locale: "de" });

    expect(await cms.findById("pages", team.id, { locale: "de", fallback: false })).toMatchObject({
      path: "/ueber-uns/team",
    });
    expect((await rows(jobs.id))?.locales).toEqual(["en"]);
    expect(await cms.findById("pages", jobs.id, { locale: "de" })).toMatchObject({
      path: "/about/jobs",
    });
    expect(await cms.findById("pages", team.id)).toMatchObject({ path: "/about/team" });
  });
});

describe("integrity", () => {
  // The collections of these tests are not part of the typed `localized()` schema.
  const make = (extra: { [key: string]: unknown } = {}): any => localized(extra);
  const draftDe = { draft: true, locale: "de" } as never;
  const articles = (onDelete: "restrict" | "set-null" | "cascade") => ({
    localized: true,
    fields: {
      title: { type: "text" },
      slug: { type: "text", unique: true },
      ref: { type: "relation", collection: "authors", onDelete },
    },
  });
  const withRule = (onDelete: "restrict" | "set-null" | "cascade") =>
    make({ collections: { articles: articles(onDelete) } });

  // An English article that does not reference the author, translated to German with a reference.
  async function german(onDelete: "restrict" | "set-null" | "cascade") {
    const s = withRule(onDelete);
    const author = await s.cms.create("authors", { name: "Ann" });
    const article = await s.cms.create("articles", { title: "Hello" });
    await s.cms.update("articles", article.id, { title: "Hallo", ref: author.id }, de);
    return { ...s, author, id: article.id as string };
  }
  const read = (cms: any, id: string, options: object = strict) =>
    cms.withDrafts().findById("articles", id, { ...options, populate: false });

  it("blocks the delete of a document that a German row references with restrict", async () => {
    const { cms, author, id } = await german("restrict");
    await expect(cms.delete("authors", author.id)).rejects.toMatchObject({
      references: [{ collection: "articles", id }],
    });
    expect(await cms.findById("authors", author.id)).toBeDefined();
  });

  it("blocks the delete when only a German draft references it", async () => {
    const s = withRule("restrict");
    const author = await s.cms.create("authors", { name: "Ann" });
    const article = await s.cms.create("articles", { title: "Hello" });
    await s.cms.update("articles", article.id, { title: "Hallo", ref: author.id }, draftDe);

    await expect(s.cms.delete("authors", author.id)).rejects.toMatchObject({
      references: [{ collection: "articles", id: article.id }],
    });
  });

  it("nulls the reference in the German row only with set-null", async () => {
    const { cms, author, id } = await german("set-null");
    await cms.delete("authors", author.id);

    expect(await read(cms, id)).toMatchObject({ title: "Hallo", ref: null, hasDraft: false });
    expect(await read(cms, id, { locale: "en", fallback: false })).toMatchObject({
      title: "Hello",
    });
    expect((await read(cms, id)).locales).toEqual(["en", "de"]);
  });

  it("nulls the reference in every locale row that holds it", async () => {
    const { cms, author, id } = await german("set-null");
    await cms.update("articles", id, { ref: author.id }, { locale: "en" } as never);
    await cms.delete("authors", author.id);

    expect(await read(cms, id)).toMatchObject({ title: "Hallo", ref: null });
    expect(await read(cms, id, { locale: "en", fallback: false })).toMatchObject({
      title: "Hello",
      ref: null,
    });
  });

  it("nulls the reference in the English row when the delete runs in German", async () => {
    let victim = "";
    const s = make({
      collections: {
        articles: {
          ...articles("set-null"),
          hooks: {
            afterChange: [
              async ({ cms, doc }: any) => {
                if (doc.title === "bye") await cms.delete("authors", victim);
              },
            ],
          },
        },
      },
    });
    const author = await s.cms.create("authors", { name: "Ann" });
    victim = author.id;
    const article = await s.cms.create("articles", { title: "Hello", ref: author.id });

    await s.cms.update("articles", article.id, { title: "bye" }, de);
    expect(await read(s.cms, article.id, { locale: "en", fallback: false })).toMatchObject({
      ref: null,
      title: "Hello",
    });
  });

  it("nulls the reference in a German draft and keeps the rest of it", async () => {
    const { cms, author, id } = await german("set-null");
    await cms.update("articles", id, { title: "Entwurf", ref: author.id }, draftDe);
    await cms.delete("authors", author.id);

    expect(await read(cms, id)).toMatchObject({ title: "Entwurf", ref: null, hasDraft: true });
    const published = await cms.findById("articles", id, {
      locale: "de",
      fallback: false,
      populate: false,
    });
    expect(published).toMatchObject({ title: "Hallo", ref: null });
  });

  it("nulls the reference of a localized global", async () => {
    const s = make({
      globals: {
        site: {
          localized: true,
          fields: { tagline: { type: "text" }, owner: { type: "relation", collection: "authors" } },
        },
      },
    });
    const author = await s.cms.create("authors", { name: "Ann" });
    await s.cms.setGlobal("site", { tagline: "Hallo", owner: author.id }, de);
    await s.cms.delete("authors", author.id);

    expect(
      await s.cms.getGlobal("site", { locale: "de", fallback: false, populate: false } as never),
    ).toMatchObject({
      tagline: "Hallo",
      owner: null,
    });
  });

  it("cascades to a document that a German row references", async () => {
    const { cms, author, id } = await german("cascade");
    await cms.delete("authors", author.id);
    expect(await read(cms, id, { locale: "en", fallback: false })).toBeUndefined();
  });

  it("lists a document in a join from the author in the locale that references it", async () => {
    const s = make({
      collections: {
        authors: {
          fields: {
            name: { type: "text" },
            articles: { type: "join", collection: "articles", on: "ref" },
          },
        },
        articles: articles("set-null"),
      },
    });
    const author = await s.cms.create("authors", { name: "Ann" });
    const article = await s.cms.create("articles", { title: "Hello" });
    await s.cms.update("articles", article.id, { title: "Hallo", ref: author.id }, de);

    const join = (options: object) =>
      s.cms.findById("authors", author.id, { populate: { articles: true }, ...options } as never);
    expect((await join(strict))?.articles).toMatchObject([{ id: article.id, title: "Hallo" }]);
    expect((await join({ locale: "en", fallback: false }))?.articles).toEqual([]);
  });

  it("keeps the media of a localized image from being deleted", async () => {
    const { png } = await import("./fixtures.ts");
    const { tmpDir } = await import("./setup.ts");
    const { local } = await import("../media/storage/local/index.ts");
    const s = make({
      media: { storage: local({ dir: tmpDir() }) },
      collections: {
        pages: { localized: true, fields: { title: { type: "text" }, hero: { type: "image" } } },
      },
    });
    const file = await s.cms.media.upload(png, { filename: "a.png", mimeType: "image/png" });
    const page = await s.cms.create("pages", { title: "Hello" });
    await s.cms.update("pages", page.id, { title: "Hallo", hero: file.id }, de);

    await expect(s.cms.media.delete(file.id)).rejects.toMatchObject({
      references: [{ collection: "pages", id: page.id }],
    });
  });

  describe("unique", () => {
    const setup = () => make({ collections: { articles: articles("set-null") } });
    const create = (cms: any, data: object, options?: object) =>
      cms.create("articles", data, options);

    it("allows the same slug in English and German", async () => {
      const { cms } = setup();
      const a = await create(cms, { slug: "hello" });
      await cms.update("articles", a.id, { slug: "hello" }, de);
      const b = await create(cms, { slug: "other" });
      await expect(cms.update("articles", b.id, { slug: "other" }, de)).resolves.toBeDefined();
    });

    it("rejects a slug that another document uses in the same locale", async () => {
      const { cms } = setup();
      const a = await create(cms, { slug: "en-a" });
      await cms.update("articles", a.id, { slug: "de-a" }, de);
      const b = await create(cms, { slug: "en-b" });

      await expect(cms.update("articles", b.id, { slug: "de-a" }, de)).rejects.toMatchObject({
        errors: { slug: "Already used" },
      });
      await expect(create(cms, { slug: "de-a" }, de)).rejects.toMatchObject({
        errors: { slug: "Already used" },
      });
    });

    it("rejects a German slug equal to the English slug of an untranslated document", async () => {
      const { cms } = setup();
      await create(cms, { slug: "hello" });
      const b = await create(cms, { slug: "other" });

      await expect(cms.update("articles", b.id, { slug: "hello" }, de)).rejects.toMatchObject({
        errors: { slug: "Already used" },
      });
    });

    it("allows a German slug equal to the English slug of a translated document", async () => {
      const { cms } = setup();
      const a = await create(cms, { slug: "hello" });
      await cms.update("articles", a.id, { slug: "hallo" }, de);
      const b = await create(cms, { slug: "other" });

      await expect(cms.update("articles", b.id, { slug: "hello" }, de)).resolves.toBeDefined();
    });
  });
});

describe("shared draft", () => {
  const draftDe = { draft: true, locale: "de" } as never;
  const drafts = (cms: any, id: string, options: object = {}) =>
    cms.withDrafts().findById("posts", id, { fallback: false, ...options });

  async function published() {
    const s = localized();
    const post = await s.cms.create("posts", { title: "Hello", views: 1 });
    return { ...s, id: post.id as string };
  }

  it("stays false for a draft that changes localized fields only", async () => {
    const { cms, id } = await published();
    const doc = await cms.update("posts", id, { title: "Hallo" }, draftDe);

    expect(doc).toMatchObject({ hasDraft: true, sharedDraft: false });
    expect(await drafts(cms, id, de)).toMatchObject({ sharedDraft: false });
    expect(await cms.findById("posts", id)).toMatchObject({ sharedDraft: false });
  });

  it("is true when a shared field changes, until a publish clears it", async () => {
    const { cms, id } = await published();
    const doc = await cms.update("posts", id, { title: "Hallo", views: 5 }, draftDe);
    expect(doc).toMatchObject({ sharedDraft: true });
    expect(await drafts(cms, id, de)).toMatchObject({ sharedDraft: true });
    expect(await cms.findById("posts", id)).toMatchObject({ sharedDraft: true, views: 1 });

    await cms.update("posts", id, { title: "Hallo!" }, draftDe);
    expect(await drafts(cms, id, de)).toMatchObject({ sharedDraft: true, views: 5 });

    expect(await cms.publish("posts", id, de)).toMatchObject({ sharedDraft: false });
    expect(await drafts(cms, id, de)).toMatchObject({ sharedDraft: false, views: 5 });
  });

  it("is false again when a shared field returns to its published value", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { views: 5 }, draftDe);
    await cms.update("posts", id, { views: 1 }, draftDe);
    expect(await drafts(cms, id, de)).toMatchObject({ sharedDraft: false, views: 1 });
  });

  it("is false for a document created as a draft with localized fields only", async () => {
    const { cms } = localized();
    const doc = await cms.create("posts", { title: "Hello" }, { draft: true });
    expect(doc).toMatchObject({ sharedDraft: false });
  });

  it("is dropped by discard with all", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { views: 5 }, draftDe);
    await cms.discard("posts", id, { all: true } as never);
    expect(await drafts(cms, id, de)).toMatchObject({ sharedDraft: false, views: 1 });
  });

  it("is a selectable metadata key on localized documents", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { views: 5 }, draftDe);
    const doc = await cms
      .withDrafts()
      .findById("posts", id, { select: { sharedDraft: true } } as never);
    expect(doc).toEqual({ id, sharedDraft: true });
  });

  it("is missing on unlocalized documents", async () => {
    const { cms } = localized();
    const author = await cms.create("authors", { name: "Ann" });
    expect(author).not.toHaveProperty("sharedDraft");
  });

  it("tracks a localized global", async () => {
    const { cms } = localized();
    await cms.setGlobal("site", { tagline: "Hi", email: "a@b.co" });
    expect(await cms.setGlobal("site", { tagline: "Hallo" }, draftDe)).toMatchObject({
      sharedDraft: false,
    });
    expect(await cms.setGlobal("site", { email: "c@d.co" }, draftDe)).toMatchObject({
      sharedDraft: true,
    });
    expect(await cms.withDrafts().getGlobal("site", { locale: "de" } as never)).toMatchObject({
      sharedDraft: true,
    });
    expect(await cms.publishGlobal("site", de)).toMatchObject({ sharedDraft: false });
  });
});

describe("copy and remove", () => {
  const draftDe = { draft: true, locale: "de" } as never;
  const drafts = (cms: any, id: string, locale: string) =>
    cms.withDrafts().findById("posts", id, { locale, fallback: false });

  async function published() {
    const s = localized();
    const post = await s.cms.create("posts", { title: "Hello", body: "Text", views: 1 });
    return { ...s, id: post.id as string };
  }

  it("copies to a new locale as a draft", async () => {
    const { cms, id } = await published();
    const doc = await (cms as any).copyLocale("posts", id, { from: "en", to: "de" });

    expect(doc).toMatchObject({ title: "Hello", body: "Text", locale: "de", hasDraft: true });
    expect(await drafts(cms, id, "de")).toMatchObject({ title: "Hello", hasDraft: true });
    expect(await cms.findById("posts", id, { locale: "de", fallback: false } as never)).toBe(
      undefined,
    );
  });

  it("replaces the pending draft of the target", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo", body: "Welt" }, draftDe);
    await (cms as any).copyLocale("posts", id, { from: "en", to: "de" });

    expect(await drafts(cms, id, "de")).toMatchObject({ title: "Hello", body: "Text" });
  });

  it("keeps the published version of the target until it is published", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, { locale: "de" } as never);
    await (cms as any).copyLocale("posts", id, { from: "en", to: "de" });

    const strict = { locale: "de", fallback: false } as never;
    expect(await cms.findById("posts", id, strict)).toMatchObject({ title: "Hallo" });
    await cms.publish("posts", id, { locale: "de" } as never);
    expect(await cms.findById("posts", id, strict)).toMatchObject({ title: "Hello" });
  });

  it("copies the draft of the source and leaves shared fields alone", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Draft", views: 9 }, { draft: true } as never);
    await (cms as any).copyLocale("posts", id, { from: "en", to: "de" });

    expect(await drafts(cms, id, "de")).toMatchObject({ title: "Draft", views: 9 });
    expect(await cms.findById("posts", id)).toMatchObject({ views: 1 });
  });

  it("copies straight to the data without drafts", async () => {
    const { cms } = localized();
    const note = await cms.create("notes", { text: "Hello" });
    const doc = await (cms as any).copyLocale("notes", note.id, { from: "en", to: "de" });

    expect(doc).toMatchObject({ text: "Hello", locale: "de", hasDraft: false });
    expect(
      await cms.findById("notes", note.id, { locale: "de", fallback: false } as never),
    ).toMatchObject({
      text: "Hello",
    });
  });

  it("refuses unknown, equal and missing source locales", async () => {
    const { cms, id } = await published();
    const copy = (from: string, to: string) => (cms as any).copyLocale("posts", id, { from, to });
    await expect(copy("en", "fr")).rejects.toBeInstanceOf(ValidationError);
    await expect(copy("fr", "de")).rejects.toBeInstanceOf(ValidationError);
    await expect(copy("en", "en")).rejects.toBeInstanceOf(ValidationError);
    await expect(copy("de", "en")).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an unlocalized collection and returns undefined for a missing document", async () => {
    const { cms, id } = await published();
    const author = await cms.create("authors", { name: "Ann" });
    await expect(
      (cms as any).copyLocale("authors", author.id, { from: "en", to: "de" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(
      await (cms as any).copyLocale("posts", "nope", { from: "en", to: "de" }),
    ).toBeUndefined();
    expect(id).toBeTruthy();
  });

  it("runs the normal hooks in the target locale", async () => {
    const calls: Array<string | undefined> = [];
    const { cms } = localized({
      collections: {
        posts: { hooks: { beforeChange: [({ locale }: HookArgs) => void calls.push(locale)] } },
      },
    });
    const post = await cms.create("posts", { title: "Hello" });
    calls.length = 0;
    await (cms as any).copyLocale("posts", post.id, { from: "en", to: "de" });
    expect(calls).toEqual(["de"]);
  });

  it("removes a locale", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, { locale: "de" } as never);
    const doc = await (cms as any).removeLocale("posts", id, "de");

    expect(doc).toMatchObject({ locale: "de", locales: ["en"] });
    expect(
      await cms.findById("posts", id, { locale: "de", fallback: false } as never),
    ).toBeUndefined();
    expect(await cms.findById("posts", id)).toMatchObject({ title: "Hello" });
  });

  it("removes a locale that only has a draft", async () => {
    const { cms, id } = await published();
    await cms.update("posts", id, { title: "Hallo" }, draftDe);
    await (cms as any).removeLocale("posts", id, "de");
    expect(await drafts(cms, id, "de")).toMatchObject({ locales: ["en"], hasDraft: false });
  });

  it("refuses to remove the default locale", async () => {
    const { cms, id } = await published();
    await expect((cms as any).removeLocale("posts", id, "en")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses to remove the last locale row", async () => {
    const { cms } = localized();
    const post = await cms.create("posts", { title: "Nur de" }, { locale: "de" } as never);
    await expect((cms as any).removeLocale("posts", post.id, "de")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses an unknown locale, an unlocalized collection and a missing locale row", async () => {
    const { cms, id } = await published();
    const remove = (c: string, i: string, l: string) => (cms as any).removeLocale(c, i, l);
    await expect(remove("posts", id, "fr")).rejects.toBeInstanceOf(ValidationError);
    await expect(remove("posts", id, "de")).rejects.toBeInstanceOf(ValidationError);
    const author = await cms.create("authors", { name: "Ann" });
    await expect(remove("authors", author.id, "de")).rejects.toBeInstanceOf(ValidationError);
    expect(await remove("posts", "nope", "de")).toBeUndefined();
  });

  it("runs afterChange with the document afterwards", async () => {
    const calls: Array<[string | undefined, unknown]> = [];
    const { cms } = localized({
      collections: {
        posts: {
          hooks: {
            afterChange: [({ doc, locale }: any) => void calls.push([locale, doc.locales])],
          },
        },
      },
    });
    const post = await cms.create("posts", { title: "Hello" });
    await cms.update("posts", post.id, { title: "Hallo" }, { locale: "de" } as never);
    calls.length = 0;
    await (cms as any).removeLocale("posts", post.id, "de");
    expect(calls).toEqual([["de", ["en"]]]);
  });

  it("copies and removes in a localized global", async () => {
    const { cms } = localized();
    await cms.setGlobal("site", { tagline: "Hi" });
    const copied = await (cms as any).copyGlobalLocale("site", { from: "en", to: "de" });
    expect(copied).toMatchObject({ tagline: "Hi", locale: "de", hasDraft: true });

    await cms.publishGlobal("site", { locale: "de" } as never);
    const removed = await (cms as any).removeGlobalLocale("site", "de");
    expect(removed).toMatchObject({ locale: "de", locales: ["en"] });
    await expect((cms as any).removeGlobalLocale("site", "en")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      (cms as any).copyGlobalLocale("site", { from: "en", to: "en" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("copies and removes over HTTP, and needs a session", async () => {
    const s = localized();
    const anon = await s.fetchWithSession("/collections/posts/x/locales/de/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "en" }),
    });
    expect(anon.status).toBe(401);
    expect(
      (await s.fetchWithSession("/collections/posts/x/locales/de", { method: "DELETE" })).status,
    ).toBe(401);
    expect(
      (await s.fetchWithSession("/globals/site/locales/de", { method: "DELETE" })).status,
    ).toBe(401);

    await s.client.signUp(admin);
    const send = (method: string, path: string, body?: object) =>
      s.fetchWithSession(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body && JSON.stringify(body),
      });
    const { id } = (await (
      await send("POST", "/collections/posts", { title: "Hello" })
    ).json()) as {
      id: string;
    };

    const copied = await send("POST", `/collections/posts/${id}/locales/de/copy`, { from: "en" });
    expect(copied.status).toBe(200);
    expect(await copied.json()).toMatchObject({ title: "Hello", locale: "de", hasDraft: true });
    expect((await send("POST", `/collections/posts/${id}/locales/de/copy`, {})).status).toBe(400);
    expect(
      (await send("POST", `/collections/posts/nope/locales/de/copy`, { from: "en" })).status,
    ).toBe(404);

    await send("POST", `/collections/posts/${id}/publish?locale=de`);
    expect((await send("DELETE", `/collections/posts/${id}/locales/en`)).status).toBe(400);
    const removed = await send("DELETE", `/collections/posts/${id}/locales/de`);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({ locales: ["en"] });
    expect((await send("DELETE", `/collections/posts/nope/locales/de`)).status).toBe(404);

    await send("PUT", "/globals/site", { tagline: "Hi" });
    const global = await send("POST", "/globals/site/locales/de/copy", { from: "en" });
    expect(await global.json()).toMatchObject({ tagline: "Hi", locale: "de" });
    await send("POST", "/globals/site/publish?locale=de");
    const gone = await send("DELETE", "/globals/site/locales/de");
    expect(await gone.json()).toMatchObject({ locales: ["en"] });
  });
});

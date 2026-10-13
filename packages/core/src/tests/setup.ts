import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient as createLibsql } from "@libsql/client";
import { expect } from "vitest";
import { CmsError, createClient } from "../client/index.ts";
import { defineCms, type MediaOptions, type PopulateOptions, type Schema } from "../index.ts";
import { local } from "../media/storage/local/index.ts";

export const origin = "http://localhost";
export const base = {
  collections: {
    posts: {
      fields: {
        title: { type: "text", required: true },
        views: { type: "number" },
        featured: { type: "boolean" },
        seo: {
          type: "group",
          label: "SEO",
          fields: { title: { type: "text" }, noindex: { type: "boolean" } },
        },
      },
    },
  },
  globals: { site: { fields: { name: { type: "text" } } } },
  database: { url: ":memory:" },
  secret: "x".repeat(32),
} as const;
export const define = (secret: string) => defineCms({ ...base, secret });

export function setup<
  C extends { schema: Schema; fetch(request: Request): Promise<Response> } = ReturnType<
    typeof define
  >,
>(cms: C = define(base.secret) as never) {
  const jar = new Map<string, string>();
  // Keeps cookies between requests, like a browser. An empty value clears one.
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", origin);
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await cms.fetch(new Request(input, { ...init, headers }));
    for (const c of res.headers.getSetCookie()) {
      const [name, value] = c.split(";")[0].split(/=(.*)/);
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
    return res;
  };
  return { cms, fetch, client: createClient<typeof cms>({ baseUrl: origin, fetch }) };
}

/** A fresh instance, a client with its own cookie jar, and a raw fetch under `/api/cms`. */
export function fresh() {
  const s = setup();
  const fetchWithSession = (path: string, init?: RequestInit) =>
    s.fetch(`${origin}/api/cms${path}`, init);
  return { cms: s.cms, client: s.client, fetchWithSession };
}
export type Env = ReturnType<typeof fresh>;

/** The meta of a global that was never published. */
export const unpublished = { publishedAt: null, hasDraft: false };
/** The meta of a published document or global without a draft. */
export const published = { publishedAt: expect.any(String), hasDraft: false };

export const admin = { name: "Admin", email: "a@b.co", password: "password123" };

export const tmpDb = () => `file:${mkdtempSync(join(tmpdir(), "integral-"))}/cms.db`;

export async function tables(url: string) {
  const db = createLibsql({ url });
  try {
    return (await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map(
      (r) => r.name,
    );
  } finally {
    db.close();
  }
}

export async function status(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  return error instanceof CmsError ? error.status : error;
}

export const relational = (url = ":memory:", populate: PopulateOptions = {}) =>
  defineCms({
    collections: {
      assets: {
        fields: {
          url: { type: "text", required: true },
          usedIn: { type: "join", collection: "posts", on: "seo.image" },
        },
      },
      authors: {
        titleField: "name",
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
      notes: {
        fields: {
          post: { type: "relation", collection: "posts", required: true },
          pin: { type: "relation", collection: "pages", required: true },
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
    populate,
    database: { url },
    secret: "x".repeat(32),
  });

// Seeds one graph through the local API and returns the ids.
export async function seed(cms: ReturnType<typeof relational>) {
  const m = await cms.create("assets", { url: "/a.png" });
  const a = await cms.create("authors", { name: "Ann", avatar: m.id });
  const [t1, t2] = [
    await cms.create("tags", { name: "one" }),
    await cms.create("tags", { name: "two" }),
  ];
  const p = await cms.create("posts", {
    title: "Hi",
    author: a.id,
    tags: [t1.id, t2.id],
    seo: { image: m.id },
  });
  return { m, a, t1, t2, p };
}

/** A temp directory for `local()`. */
export const tmpDir = () => mkdtempSync(join(tmpdir(), "integral-media-"));

/**
 * An instance with `media` on `local()` in a temp dir with 1 KB parts, `posts` with image and file fields, a client and a
 * raw fetch under `/api/cms`. `extra` goes into `defineCms()`.
 */
export function withMedia(media: Partial<MediaOptions> = {}, extra: object = {}) {
  const dir = tmpDir();
  const cms = defineCms({
    ...base,
    collections: {
      posts: {
        fields: {
          title: { type: "text" },
          hero: { type: "image" },
          og: { type: "image", onDelete: "set-null", image: { sizes: [150], quality: 50 } },
          gallery: { type: "image", many: true, onDelete: "set-null" },
          attachment: { type: "file", accept: ["application/pdf"], maxSize: 2048 },
        },
      },
    },
    media: { storage: local({ dir, partSize: 1024 }), ...media },
    ...extra,
  });
  const s = setup(cms);
  const fetchWithSession = (path: string, init?: RequestInit) =>
    s.fetch(`${origin}/api/cms${path}`, init);
  return { ...s, dir, fetchWithSession };
}

/**
 * A `:memory:` instance with `en` and `de`, a localized `posts`, a localized `notes` without drafts, an unlocalized
 * `authors` and a localized `site` global. `author` and `editor` are shared relations with different `onDelete`
 * rules; `related` is a localized relation. `extra` goes into `defineCms()`; `extra.collections.posts` merges into `posts`, other
 * entries add collections.
 */
export function localized(
  extra: { collections?: { [name: string]: object | undefined }; [key: string]: unknown } = {},
) {
  const { collections: { posts: override, ...more } = {}, ...rest } = extra;
  const cms = defineCms({
    collections: {
      authors: { fields: { name: { type: "text", required: true } } },
      posts: {
        localized: true,
        fields: {
          title: { type: "text", required: true },
          slug: { type: "text", unique: true },
          body: { type: "text" },
          secret: { type: "text", private: true },
          views: { type: "number", localized: false },
          author: {
            type: "relation",
            collection: "authors",
            localized: false,
            onDelete: "cascade",
          },
          editor: {
            type: "relation",
            collection: "authors",
            localized: false,
            onDelete: "set-null",
          },
          related: { type: "relation", collection: "authors" },
          seo: { type: "group", fields: { description: { type: "text" } } },
        },
        ...override,
      },
      notes: {
        localized: true,
        drafts: false,
        fields: { text: { type: "text", required: true } },
      },
      ...more,
    },
    globals: {
      site: {
        localized: true,
        fields: { tagline: { type: "text" }, email: { type: "text", localized: false } },
      },
    },
    localization: { locales: ["en", "de"], defaultLocale: "en" },
    database: { url: ":memory:" },
    secret: "x".repeat(32),
    media: false,
    ...rest,
  });
  const s = setup(cms);
  const fetchWithSession = (path: string, init?: RequestInit) =>
    s.fetch(`${origin}/api/cms${path}`, init);
  return { ...s, fetchWithSession };
}

type Stored = { data: object; draft?: object | null; published?: boolean };

/**
 * `localized()` on a file database, with helpers that insert rows the way a write stores them: `doc()` for a
 * `posts` document with its locale rows, `global()` for the `site` global. Used by tests of reads.
 */
export function seeded(extra: Parameters<typeof localized>[0] = {}) {
  const url = tmpDb();
  const s = localized({ ...extra, database: { url } });
  const raw = createLibsql({ url });
  // Reading once connects and migrates, so the tables exist.
  const ready = s.cms.find("authors");
  let clock = 1_000;
  const time = () => ++clock;
  const at = (published: boolean | undefined) => (published === false ? null : time());
  const json = (v: object | null | undefined) => (v ? JSON.stringify(v) : null);

  async function doc(
    id: string,
    shared: Stored,
    locales: Record<string, Stored> = {},
    collection = "posts",
  ) {
    await ready;
    await raw.execute({
      sql: `INSERT INTO cms_documents (id, collection, data, draft, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        collection,
        json(shared.data),
        json(shared.draft),
        time(),
        time(),
        at(shared.published),
      ],
    });
    for (const [locale, r] of Object.entries(locales))
      await raw.execute({
        sql: `INSERT INTO cms_document_locales (document_id, locale, data, draft, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [id, locale, json(r.data), json(r.draft), time(), time(), at(r.published)],
      });
  }

  async function global(name: string, shared: Stored, locales: Record<string, Stored> = {}) {
    await ready;
    await raw.execute({
      sql: `INSERT INTO cms_globals (name, data, draft, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [name, json(shared.data), json(shared.draft), time(), time(), at(shared.published)],
    });
    for (const [locale, r] of Object.entries(locales))
      await raw.execute({
        sql: `INSERT INTO cms_global_locales (name, locale, data, draft, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [name, locale, json(r.data), json(r.draft), time(), time(), at(r.published)],
      });
  }

  return { ...s, doc, global };
}

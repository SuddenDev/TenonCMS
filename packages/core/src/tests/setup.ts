import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient as createLibsql } from "@libsql/client";
import { expect } from "vitest";
import { CmsError, createClient } from "../client/index.ts";
import { defineCms, type MediaOptions, type PopulateConfig, type Schema } from "../index.ts";
import { local } from "../media/storage/local.ts";

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

export const relational = (url = ":memory:", populate: PopulateConfig = {}) =>
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

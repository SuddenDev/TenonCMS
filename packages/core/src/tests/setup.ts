import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient as createLibsql } from "@libsql/client";
import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import { PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import { expect, onTestFinished } from "vitest";
import { authOptions } from "../auth/config/build-options.ts";
import type { AuthOptions } from "../auth/config/options.ts";
import { CmsError, createClient } from "../client/index.ts";
import { pgliteDialect } from "../db/adapters/pglite.ts";
import { createDb, type DatabaseOptions } from "../db/create-db.ts";
import { migrate } from "../db/migrations/migrate.ts";
import { defineCms, type MediaOptions, type PopulateOptions, type Schema } from "../index.ts";
import { pglite } from "../integrations/pglite/index.ts";
import { local } from "../media/storage/local/index.ts";
import { libsql } from "../integrations/libsql/index.ts";
import { sqlite } from "../integrations/sqlite/index.ts";

/** Whether the suite runs on PGlite (the `pglite` project) instead of libsql. */
export const onPglite = process.env.CMS_TEST_DB === "pglite";
/** Whether the suite runs on `node:sqlite` (the `sqlite` project) instead of libsql. */
const onNodeSqlite = process.env.CMS_TEST_DB === "sqlite";

// One migrated PGlite per worker. A clone of it skips the WASM boot and the CMS and auth migrations.
let template: Promise<PGlite> | undefined;
const migratedPglite = () =>
  (template ??= (async () => {
    const client = new PGlite();
    const db = createDb({ dialect: pgliteDialect(client) });
    await migrate(db, authOptions(db, base.secret, {} as AuthOptions));
    return client;
  })());

/**
 * A clone of the migrated PGlite. It clones on the first query, because the driver's client MUST be synchronous. A
 * clone made inside a test closes when the test ends: each holds its own WASM memory, which a worker would otherwise
 * keep until it runs out.
 */
function clonePglite() {
  let clone: Promise<PGliteInterface> | undefined;
  const open = () => (clone ??= migratedPglite().then((client) => client.clone()));
  const close = async () => {
    const client = await clone;
    if (client && !client.closed) await client.close();
  };
  try {
    onTestFinished(close);
  } catch {
    // Outside a test (`beforeAll`, module scope), the clone lives as long as the worker.
  }
  return {
    query: async (...args: Parameters<PGlite["query"]>) => (await open()).query(...args),
    close,
  } as PGliteInterface;
}

/**
 * An in-memory database. Like libsql's `:memory:`, each connection opens its own empty one, so instances that share
 * these options do not share data.
 */
export const testDatabase = (): DatabaseOptions =>
  onPglite
    ? {
        dialect: {
          createAdapter: () => new PostgresAdapter(),
          createIntrospector: (db) => new PostgresIntrospector(db),
          createQueryCompiler: () => new PostgresQueryCompiler(),
          createDriver: () => pgliteDialect(clonePglite()).createDriver(),
        },
      }
    : onNodeSqlite
      ? sqlite(":memory:")
      : libsql(":memory:");

/**
 * A cheap password hash for tests. better-auth's scrypt costs about 60 ms per sign-up, user create and sign-in.
 * Tests of the hash itself MUST use an instance without it.
 */
export const fastPassword = {
  hash: async (password: string) => `test:${password}`,
  verify: async ({ hash, password }: { hash: string; password: string }) =>
    hash === `test:${password}`,
};
export const fastAuth = { emailAndPassword: { enabled: true, password: fastPassword } };

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
  database: testDatabase(),
  secret: "x".repeat(32),
  auth: fastAuth,
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

type Fetch = ReturnType<typeof setup>["fetch"];
/** A JSON `POST` under `/_tenon`. */
export const post = (fetch: Fetch, path: string, body: unknown) =>
  fetch(`${origin}/_tenon${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** An instance with a signed-in admin, and a helper that creates a user as that admin. */
export async function withAdmin<
  C extends { schema: Schema; fetch(request: Request): Promise<Response> },
>(cms: C = defineCms(base) as never) {
  const env = setup(cms);
  await env.client.signUp(admin);
  const create = async (user: object) => {
    const res = await post(env.fetch, "/auth/admin/create-user", user);
    return ((await res.json()) as { user: { id: string; role: string } }).user;
  };
  const me = (await env.client.getSession()) as unknown as { user: { id: string; role: string } };
  return { ...env, cms, create, me: me.user };
}

/** A fresh instance, a client with its own cookie jar, and a raw fetch under `/_tenon`. */
export function fresh() {
  const s = setup();
  const fetchWithSession = (path: string, init?: RequestInit) =>
    s.fetch(`${origin}/_tenon${path}`, init);
  return { cms: s.cms, client: s.client, fetchWithSession };
}
export type Env = ReturnType<typeof fresh>;

/** The meta of a global that was never published. */
export const unpublished = { publishedAt: null, hasDraft: false };
/** The meta of a published document or global without a draft. */
export const published = {
  updatedAt: expect.any(String),
  publishedAt: expect.any(String),
  hasDraft: false,
};

export const admin = { name: "Admin", email: "a@b.co", password: "password123" };

export const tmpDb = () => `file:${mkdtempSync(join(tmpdir(), "tenon-"))}/cms.db`;

/**
 * A database that instances share, with `exec()` for raw SQL on it: a SQLite file, or one PGlite. `?` marks a
 * parameter.
 */
export function testDb() {
  if (onPglite) {
    const client = new PGlite();
    const exec = async (statement: string, args: unknown[] = []) => {
      let n = 0;
      const text = statement.replace(/\?/g, () => `$${++n}`);
      return (await client.query<any>(text, args, { parsers: { 20: Number } })).rows;
    };
    const tables = async () =>
      (
        await exec(
          `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()`,
        )
      ).map((r) => r.name as string);
    return { database: pglite(client), exec, tables };
  }

  const url = tmpDb();
  if (onNodeSqlite) {
    const path = url.slice("file:".length);
    const exec = async (statement: string, args: unknown[] = []) => {
      const db = new DatabaseSync(path);
      try {
        const query = db.prepare(statement);
        if (query.columns().length) return query.all(...(args as never[])) as any[];
        query.run(...(args as never[]));
        return [];
      } finally {
        db.close();
      }
    };
    const tables = async () =>
      (await exec(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map(
        (r) => r.name as string,
      );
    return { database: sqlite(path), exec, tables };
  }

  const exec = async (statement: string, args: unknown[] = []) => {
    const db = createLibsql({ url });
    try {
      return (await db.execute({ sql: statement, args: args as never[] })).rows as any[];
    } finally {
      db.close();
    }
  };
  const tables = async () =>
    (await exec(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map(
      (r) => r.name as string,
    );
  return { database: libsql(url), exec, tables };
}

export async function status(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  return error instanceof CmsError ? error.status : error;
}

export const relational = (
  database: DatabaseOptions = testDatabase(),
  populate: PopulateOptions = {},
) =>
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
    database,
    secret: "x".repeat(32),
    auth: base.auth,
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
export const tmpDir = () => mkdtempSync(join(tmpdir(), "tenon-media-"));

/**
 * An instance with `media` on `local()` in a temp dir with 1 KB parts, `posts` with image and file fields, a client and a
 * raw fetch under `/_tenon`. `extra` goes into `defineCms()`.
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
    s.fetch(`${origin}/_tenon${path}`, init);
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
    database: testDatabase(),
    secret: "x".repeat(32),
    media: false,
    auth: base.auth,
    ...rest,
  });
  const s = setup(cms);
  const fetchWithSession = (path: string, init?: RequestInit) =>
    s.fetch(`${origin}/_tenon${path}`, init);
  return { ...s, fetchWithSession };
}

type Stored = { data: object; draft?: object | null; published?: boolean };

/**
 * `localized()` on a file database, with helpers that insert rows the way a write stores them: `doc()` for a
 * `posts` document with its locale rows, `global()` for the `site` global. Used by tests of reads.
 */
export function seeded(extra: Parameters<typeof localized>[0] = {}) {
  const { database, exec } = testDb();
  const s = localized({ ...extra, database });
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
    await exec(
      `INSERT INTO cms_documents (id, collection, data, draft, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, collection, json(shared.data), json(shared.draft), time(), time(), at(shared.published)],
    );
    for (const [locale, r] of Object.entries(locales))
      await exec(
        `INSERT INTO cms_document_locales (document_id, locale, data, draft, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, locale, json(r.data), json(r.draft), time(), time(), at(r.published)],
      );
  }

  async function global(name: string, shared: Stored, locales: Record<string, Stored> = {}) {
    await ready;
    await exec(
      `INSERT INTO cms_globals (name, data, draft, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, json(shared.data), json(shared.draft), time(), time(), at(shared.published)],
    );
    for (const [locale, r] of Object.entries(locales))
      await exec(
        `INSERT INTO cms_global_locales (name, locale, data, draft, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, locale, json(r.data), json(r.draft), time(), time(), at(r.published)],
      );
  }

  return { ...s, doc, global };
}

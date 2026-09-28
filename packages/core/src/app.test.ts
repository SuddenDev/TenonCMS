import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient as createLibsql } from "@libsql/client";
import { createAuthMiddleware } from "better-auth/api";
import { admin as adminPlugin, anonymous, twoFactor } from "better-auth/plugins";
import { beforeEach, describe, expect, it } from "vitest";
import { CmsError, createClient } from "./client.ts";
import {
  ConflictError,
  defineCms,
  defineCollection,
  defineGlobal,
  definePlugin,
  type PopulateConfig,
  type Schema,
  ValidationError,
} from "./index.ts";
import { nestedPaths, page, seo } from "./presets/index.ts";

const origin = "http://localhost";
const base = {
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
const define = (secret: string) => defineCms({ ...base, secret });

function setup<
  C extends { schema: Schema; fetch(request: Request): Promise<Response> } = ReturnType<
    typeof define
  >,
>(cms: C = define(base.secret) as never) {
  let cookie = "";
  // Keeps the session cookie between requests, like a browser.
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", origin);
    if (cookie) headers.set("cookie", cookie);
    const res = await cms.fetch(new Request(input, { ...init, headers }));
    const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    if (set.length) cookie = set.join("; ");
    return res;
  };
  return { cms, fetch, client: createClient<typeof cms>({ baseUrl: origin, fetch }) };
}

let cms: ReturnType<typeof define>;
let client: ReturnType<typeof setup<ReturnType<typeof define>>>["client"];
let fetchWithSession: (path: string, init?: RequestInit) => Promise<Response>;
beforeEach(() => {
  const s = setup();
  ({ cms, client } = s);
  fetchWithSession = (path, init) => s.fetch(`${origin}/api/cms${path}`, init);
});

const admin = { name: "Admin", email: "a@b.co", password: "password123" };

const tmpDb = () => `file:${mkdtempSync(join(tmpdir(), "integral-"))}/cms.db`;

async function tables(url: string) {
  const db = createLibsql({ url });
  try {
    return (await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map(
      (r) => r.name,
    );
  } finally {
    db.close();
  }
}

async function status(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  return error instanceof CmsError ? error.status : error;
}

const relational = (url = ":memory:", populate: PopulateConfig = {}) =>
  defineCms({
    collections: {
      media: {
        fields: {
          url: { type: "text", required: true },
          usedIn: { type: "join", collection: "posts", on: "seo.image" },
        },
      },
      authors: {
        titleField: "name",
        fields: {
          name: { type: "text", required: true },
          avatar: { type: "relation", collection: "media" },
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
          seo: { type: "group", fields: { image: { type: "relation", collection: "media" } } },
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
          logo: { type: "relation", collection: "media" },
          featured: { type: "relation", collection: "posts", many: true },
        },
      },
    },
    populate,
    database: { url },
    secret: "x".repeat(32),
  });

// Seeds one graph through the local API and returns the ids.
async function seed(cms: ReturnType<typeof relational>) {
  const m = await cms.create("media", { url: "/a.png" });
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

describe("database", () => {
  it("creates CMS and auth tables on first access", async () => {
    const url = tmpDb();
    const cms = defineCms({
      collections: { posts: { fields: {} } },
      database: { url },
      secret: "x".repeat(32),
    });
    await cms.find("posts");
    await cms.auth();
    expect(await tables(url)).toEqual(
      expect.arrayContaining([
        "cms_documents",
        "cms_globals",
        "user",
        "session",
        "account",
        "verification",
      ]),
    );
  });
});

describe("auth", () => {
  it("lets only the first user sign up", async () => {
    await client.signUp(admin);
    expect(await client.getSession()).toMatchObject({ user: { email: admin.email } });
    expect(await status(client.signUp({ ...admin, email: "c@d.co" }))).toBe(403);
  });

  it("creates plugin tables at runtime and types plugin endpoints", async () => {
    const url = tmpDb();
    const cms = defineCms({ ...base, database: { url }, auth: { plugins: [twoFactor()] } });
    const auth = await cms.auth();
    expect(typeof auth.api.enableTwoFactor).toBe("function");
    expect(await tables(url)).toContain("twoFactor");
    () => {
      // @ts-expect-error core reads the `user` table by name
      defineCms({ ...base, auth: { user: { modelName: "users" } } });
      // @ts-expect-error same for the other models
      defineCms({ ...base, auth: { session: { modelName: "sessions", expiresIn: 60 } } });
    };
  });

  it("forces email sign-in on and keeps the host's other email options", async () => {
    const { client } = setup(
      defineCms({ ...base, auth: { emailAndPassword: { enabled: false, minPasswordLength: 20 } } }),
    );
    expect(await status(client.signUp(admin))).toBe(400);
    const password = "p".repeat(20);
    await client.signUp({ ...admin, password });
    await client.signOut();
    await client.signIn({ ...admin, password });
    expect(await client.getSession()).not.toBeNull();
  });

  it("runs host database hooks after the first-user rule", async () => {
    const calls: string[] = [];
    const { client } = setup(
      defineCms({
        ...base,
        auth: {
          databaseHooks: {
            user: {
              create: {
                before: async () => {
                  calls.push("before");
                },
                after: async (user) => {
                  calls.push(`after:${user.email}`);
                },
              },
            },
          },
        },
      }),
    );
    await client.signUp(admin);
    expect(await status(client.signUp({ ...admin, email: "c@d.co" }))).toBe(403);
    expect(calls).toEqual(["before", "after:a@b.co"]);
  });

  it("lets a signed-in admin create users", async () => {
    // `defaultRole: 'admin'` makes the first user an admin.
    const cms = defineCms({ ...base, auth: { plugins: [adminPlugin({ defaultRole: "admin" })] } });
    const { client, fetch } = setup(cms);
    await client.signUp(admin);
    const res = await fetch(`${origin}/api/cms/auth/admin/create-user`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "c@d.co", password: "password123", name: "C" }),
    });
    expect(res.status).toBe(200);
    expect(await status(client.signUp({ ...admin, email: "e@f.co" }))).toBe(403);
    const auth = await cms.auth();
    await expect(
      auth.api.createUser({ body: { email: "g@h.co", password: "password123", name: "G" } }),
    ).resolves.toBeDefined();
  });

  it("rejects user creation without a session on any endpoint", async () => {
    const cms = defineCms({ ...base, auth: { plugins: [anonymous()] } });
    await setup(cms).client.signUp(admin);
    const res = await cms.fetch(
      new Request(`${origin}/api/cms/auth/sign-in/anonymous`, {
        method: "POST",
        headers: { origin },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("runs host request hooks", async () => {
    const paths: string[] = [];
    const after = createAuthMiddleware(async (ctx) => {
      paths.push(ctx.path);
    });
    const { client } = setup(defineCms({ ...base, auth: { hooks: { after } } }));
    await client.signUp(admin);
    await client.signOut();
    await client.signIn(admin);
    expect(paths).toContain("/sign-in/email");
  });

  it("signs out and in again", async () => {
    await client.signUp(admin);
    await client.signOut();
    expect(await client.getSession()).toBeNull();
    expect(await status(client.signIn({ ...admin, password: "wrong-password" }))).toBe(401);
    await client.signIn(admin);
    expect(await client.getSession()).not.toBeNull();
  });
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
      new Request(`${origin}/api/cms/collections/posts`, {
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

  it("validate data", async () => {
    await client.signUp(admin);
    expect(await status(client.create("posts", { title: "" }))).toBe(400);
    expect(await status(client.create("posts", { title: "Hi", views: "3" } as never))).toBe(400);
  });

  it("create, update and delete a document", async () => {
    await client.signUp(admin);
    const post = await client.create("posts", { title: "Hi", views: 1, extra: "x" } as never);
    expect(post).toMatchObject({ title: "Hi", views: 1 });
    expect(post).not.toHaveProperty("extra");
    expect(await client.update("posts", post.id, { title: "Hello" })).toMatchObject({
      id: post.id,
      title: "Hello",
      views: 1,
    });
    await client.update("posts", post.id, { views: null });
    expect(await client.findById("posts", post.id)).toMatchObject({ title: "Hello", views: null });
    await client.delete("posts", post.id);
    expect(await status(client.findById("posts", post.id))).toBe(404);
  });

  it("store and read a group", async () => {
    await client.signUp(admin);
    const post = await client.create("posts", {
      title: "Hi",
      seo: { title: "S", noindex: true, extra: 1 } as never,
    });
    expect(post.seo).toEqual({ title: "S", noindex: true });
    expect((await client.findById("posts", post.id)).seo).toEqual({ title: "S", noindex: true });
  });

  it("reject invalid group data", async () => {
    await client.signUp(admin);
    expect(
      await status(client.create("posts", { title: "Hi", seo: { noindex: "yes" } } as never)),
    ).toBe(400);
  });

  it("set a global", async () => {
    await client.signUp(admin);
    expect(await client.getGlobal("site")).toEqual({});
    await client.setGlobal("site", { name: "Site" });
    expect(await client.getGlobal("site")).toEqual({ name: "Site" });
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
    expect(await cms.getGlobal("site")).toEqual({ name: "Site", tagline: "U" });
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
      database: { url: ":memory:" },
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

describe("reads", () => {
  beforeEach(async () => {
    await cms.create("posts", { title: "A", views: 1, featured: true });
    await cms.create("posts", { title: "B", views: 2, featured: false });
    await cms.create("posts", { title: "C", views: 2, featured: true });
  });

  it("are public and newest first", async () => {
    expect((await client.find("posts")).map((p) => p.title)).toEqual(["C", "B", "A"]);
  });

  it("filter by field, coerced to its type", async () => {
    expect((await client.find("posts", { where: { featured: true } })).map((p) => p.title)).toEqual(
      ["C", "A"],
    );
    expect(
      (await client.find("posts", { where: { views: 2, featured: false } })).map((p) => p.title),
    ).toEqual(["B"]);
  });

  it("filter by null as the query value null", async () => {
    await cms.create("posts", { title: "D" });
    expect((await client.find("posts", { where: { views: null } })).map((p) => p.title)).toEqual([
      "D",
    ]);
    expect(
      (await client.find("posts", { where: { featured: null, views: null } })).map((p) => p.title),
    ).toEqual(["D"]);
    const res = await cms.fetch(new Request(`${origin}/api/cms/collections/posts?views=null`));
    expect((await res.json()).map((p: { title: string }) => p.title)).toEqual(["D"]);
  });

  it("ignore empty query values", async () => {
    const res = await cms.fetch(new Request(`${origin}/api/cms/collections/posts?views=&title=`));
    expect(await res.json()).toHaveLength(3);
  });

  it("ignore undefined filters", async () => {
    expect(await client.find("posts", { where: { views: undefined } })).toHaveLength(3);
  });

  it("limit results", async () => {
    expect(await client.find("posts", { limit: 2 })).toHaveLength(2);
    expect(await client.findOne("posts", { where: { views: 2 } })).toMatchObject({ title: "C" });
  });

  it.each(["?nope=1", "?seo=x", "?limit=0", "?limit=-1", "?limit=abc"])(
    "reject %s",
    async (query) => {
      expect(
        (await cms.fetch(new Request(`${origin}/api/cms/collections/posts${query}`))).status,
      ).toBe(400);
    },
  );

  it("return 404 for unknown names", async () => {
    expect(await status(client.find("pages" as never))).toBe(404);
    expect(await status(client.getGlobal("nope" as never))).toBe(404);
    expect(await status(client.findById("posts", "missing"))).toBe(404);
  });
});

describe("local API", () => {
  it("rejects unknown filter fields before they reach SQL", async () => {
    await expect(cms.find("posts", { where: { "x') OR 1=1 --": 1 } as never })).rejects.toThrow(
      /Unknown field/,
    );
  });

  it("rejects group keys in where", async () => {
    await expect(cms.find("posts", { where: { seo: null } as never })).rejects.toThrow(
      /not filterable/,
    );
  });

  it("rejects group keys in where at the type level", () => {
    () => {
      // @ts-expect-error `seo` is a group
      cms.find("posts", { where: { seo: null } });
      // @ts-expect-error `seo` is a group
      client.find("posts", { where: { seo: "x" } });
    };
  });

  it("matches empty or missing fields with null and ignores undefined", async () => {
    await cms.create("posts", { title: "A", views: null });
    await cms.create("posts", { title: "B" });
    await cms.create("posts", { title: "C", views: 3 });
    const titles = async (views: number | null | undefined) =>
      (await cms.find("posts", { where: { views } })).map((p) => p.title);
    expect(await titles(null)).toEqual(["B", "A"]);
    expect(await titles(undefined)).toEqual(["C", "B", "A"]);
    expect(await titles(3)).toEqual(["C"]);
  });

  it("keeps instances apart", async () => {
    await cms.create("posts", { title: "A" });
    expect(await setup().cms.find("posts")).toEqual([]);
  });
});

describe("errors", () => {
  const post = (path: string, body: string) =>
    cms.fetch(
      new Request(`${origin}/api/cms${path}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body,
      }),
    );

  it("answer every error with a message", async () => {
    const res = await cms.fetch(new Request(`${origin}/api/cms/schema`));
    expect([res.status, await res.json()]).toEqual([401, { message: "Unauthorized" }]);
    const filter = await cms.fetch(new Request(`${origin}/api/cms/collections/posts?nope=1`));
    expect([filter.status, await filter.json()]).toEqual([400, { message: "Invalid filter" }]);
    const missing = await cms.fetch(new Request(`${origin}/api/cms/collections/nope`));
    expect([missing.status, await missing.json()]).toEqual([404, { message: "Not Found" }]);
    await client.signUp(admin);
    const malformed = await fetchWithSession("/collections/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"title":',
    });
    expect([malformed.status, await malformed.json()]).toEqual([
      400,
      { message: expect.any(String), errors: { "": expect.any(String) } },
    ]);
  });

  it("reject a malformed JSON body with 400", async () => {
    await client.signUp(admin);
    const res = await fetchWithSession("/collections/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"title":',
    });
    expect(res.status).toBe(400);
  });

  it("reject invalid sign-up data", async () => {
    expect(await status(client.signUp({ ...admin, email: "not-an-email" }))).toBe(400);
    expect(await status(client.signUp({ ...admin, password: "short" }))).toBe(400);
    expect((await post("/auth/sign-up/email", "{")).status).toBe(400);
  });

  it("reject a forged session cookie", async () => {
    await client.signUp(admin);
    const res = await cms.fetch(
      new Request(`${origin}/api/cms/schema`, {
        headers: { origin, cookie: "better-auth.session_token=forged.value" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("reject writes to unknown names with 404", async () => {
    await client.signUp(admin);
    expect(await status(client.create("pages" as never, { title: "Hi" } as never))).toBe(404);
    expect(await status(client.setGlobal("nope" as never, {} as never))).toBe(404);
  });

  it("reject invalid global data", async () => {
    await client.signUp(admin);
    expect(await status(client.setGlobal("site", { name: 1 } as never))).toBe(400);
  });

  it("return 404 when updating a missing document", async () => {
    await client.signUp(admin);
    expect(await status(client.update("posts", "missing", { title: "Hi" }))).toBe(404);
  });

  it("reject invalid data on update", async () => {
    await client.signUp(admin);
    const { id } = await client.create("posts", { title: "Hi" });
    expect(await status(client.update("posts", id, { title: "" }))).toBe(400);
    expect(await client.findById("posts", id)).toMatchObject({ title: "Hi" });
  });

  it("do not find a document through another collection", async () => {
    const { id } = await cms.create("posts", { title: "Hi" });
    expect(await cms.findById("other" as never, id)).toBeUndefined();
    expect(await cms.update("other" as never, id, {})).toBeUndefined();
    await cms.delete("other" as never, id);
    expect(await cms.findById("posts", id)).toBeDefined();
  });

  it.each(["?views=abc", "?featured=yes"])(
    "reject a filter value of the wrong type: %s",
    async (query) => {
      expect(
        (await cms.fetch(new Request(`${origin}/api/cms/collections/posts${query}`))).status,
      ).toBe(400);
    },
  );

  it("keep reads working with a short secret, but fail auth", async () => {
    const bad = define("short");
    expect((await bad.fetch(new Request(`${origin}/api/cms/collections/posts`))).status).toBe(200);
    const cookie = { headers: { cookie: "better-auth.session_token=x" } };
    expect(
      (await bad.fetch(new Request(`${origin}/api/cms/collections/posts`, cookie))).status,
    ).toBe(200);
    await expect(bad.auth()).rejects.toThrow(/at least 32 characters/);
    expect((await bad.fetch(new Request(`${origin}/api/cms/schema`))).status).toBe(500);
  });

  it("reject unknown options at the type level", () => {
    // @ts-expect-error `globalz` is not an option
    defineCms({ collections: {}, globalz: {}, database: { url: ":memory:" }, secret: "" });
  });
});

describe("relation schema", () => {
  const join = { type: "join", collection: "posts", on: "author" };
  it.each([
    [
      "unknown target",
      { collections: { posts: { fields: { a: { type: "relation", collection: "nope" } } } } },
      /unknown collection "nope"/,
    ],
    [
      "join on unknown field",
      {
        collections: {
          a: { fields: { p: { type: "join", collection: "posts", on: "x" } } },
          posts: { fields: {} },
        },
      },
      /join "a.p"/,
    ],
    [
      "join on a non-relation",
      {
        collections: {
          a: { fields: { p: { type: "join", collection: "posts", on: "title" } } },
          posts: { fields: { title: { type: "text" } } },
        },
      },
      /join "a.p"/,
    ],
    [
      "join on a relation to another collection",
      {
        collections: {
          a: { fields: { p: join } },
          b: { fields: {} },
          posts: { fields: { author: { type: "relation", collection: "b" } } },
        },
      },
      /join "a.p"/,
    ],
    [
      "required + set-null",
      {
        collections: {
          a: {
            fields: {
              r: { type: "relation", collection: "a", required: true, onDelete: "set-null" },
            },
          },
        },
      },
      /set-null/,
    ],
    [
      "join in a global",
      {
        collections: { posts: { fields: { author: { type: "relation", collection: "posts" } } } },
        globals: { g: { fields: { p: join } } },
      },
      /join/,
    ],
    [
      "join in a group",
      {
        collections: {
          a: { fields: { g: { type: "group", fields: { p: join } } } },
          posts: { fields: { author: { type: "relation", collection: "a" } } },
        },
      },
      /join/,
    ],
    ["depth above maxDepth", { collections: {}, populate: { depth: 6 } }, /maxDepth/],
    [
      "cascade in a global",
      {
        collections: { a: { fields: {} } },
        globals: {
          g: { fields: { a: { type: "relation", collection: "a", onDelete: "cascade" } } },
        },
      },
      /cascade/,
    ],
  ])("rejects %s", (_, config, message) => {
    expect(() =>
      defineCms({ ...(config as object), database: { url: ":memory:" }, secret: "" } as never),
    ).toThrow(message);
  });

  it("accepts relations, joins through groups and self-references", () => {
    expect(() => relational()).not.toThrow();
  });

  it("checks relation targets and join paths at the type level", () => {
    const db = { database: { url: ":memory:" }, secret: "" };
    const authors = defineCollection({
      fields: {
        name: { type: "text" },
        posts: { type: "join", collection: "posts", on: "author" },
      },
    });
    const posts = defineCollection({
      fields: {
        author: { type: "relation", collection: "authors" },
        seo: { type: "group", fields: { image: { type: "relation", collection: "posts" } } },
        parent: { type: "relation", collection: "posts", many: true },
      },
    });
    const site = defineGlobal({ fields: { home: { type: "relation", collection: "posts" } } });
    const unknown = defineCollection({ fields: { a: { type: "relation", collection: "" } } });
    const inGroup = defineCollection({
      fields: { g: { type: "group", fields: { a: { type: "relation", collection: "nope" } } } },
    });
    const joinTarget = defineCollection({
      fields: { p: { type: "join", collection: "nope", on: "author" } },
    });
    const joinOnText = defineCollection({
      fields: { p: { type: "join", collection: "authors", on: "name" } },
    });
    const joinOnOther = defineCollection({
      fields: { p: { type: "join", collection: "posts", on: "author" } },
    });
    const badGlobal = defineGlobal({ fields: { home: { type: "relation", collection: "nope" } } });
    () => {
      defineCms({ ...db, collections: { posts, authors }, globals: { site } });
      // @ts-expect-error unknown collection
      defineCms({ ...db, collections: { posts, authors, unknown } });
      // @ts-expect-error unknown collection inside a group
      defineCms({ ...db, collections: { posts, authors, inGroup } });
      // @ts-expect-error join on an unknown collection
      defineCms({ ...db, collections: { posts, authors, joinTarget } });
      // @ts-expect-error join on a field that is not a relation
      defineCms({ ...db, collections: { posts, authors, joinOnText } });
      // @ts-expect-error join on a relation that points to another collection
      defineCms({ ...db, collections: { posts, authors, joinOnOther } });
      // @ts-expect-error relation in a global to an unknown collection
      defineCms({ ...db, collections: { posts, authors }, globals: { badGlobal } });
      defineCms({
        ...db,
        // @ts-expect-error inline: unknown collection
        collections: { a: { fields: { b: { type: "relation", collection: "nope" } } } },
      });
      defineCms({
        ...db,
        collections: {
          a: {
            fields: {
              b: { type: "relation", collection: "a" },
              // @ts-expect-error inline: join on a field that is not a relation
              j: { type: "join", collection: "a", on: "x" },
            },
          },
        },
      });
      defineCms({
        ...db,
        collections: {
          a: {
            fields: {
              b: { type: "relation", collection: "a" },
              j: { type: "join", collection: "a", on: "b" },
            },
          },
        },
      });
    };
  });
});

describe("relation writes", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    await r.client.signUp(admin);
    ids = await seed(r.cms);
  });

  it("rejects an unknown id", async () => {
    const { client } = r;
    expect(await status(client.create("posts", { title: "x", author: "nope" }))).toBe(400);
    expect(await status(client.create("posts", { title: "x", tags: ["nope"] }))).toBe(400);
    expect(await status(client.create("posts", { title: "x", seo: { image: "nope" } }))).toBe(400);
    expect(await status(client.setGlobal("site", { logo: "nope" }))).toBe(400);
  });

  it("rejects an id from another collection", async () => {
    expect(await status(r.client.create("posts", { title: "x", author: ids.t1.id }))).toBe(400);
  });

  it("rejects a self-reference", async () => {
    const page = await r.cms.create("pages", { title: "p" });
    expect(await status(r.client.update("pages", page.id, { title: "x", parent: page.id }))).toBe(
      400,
    );
    expect(await r.cms.findById("pages", page.id)).not.toHaveProperty("parent");
  });

  it("returns ids", async () => {
    expect(await r.client.create("posts", { title: "x", author: ids.a.id })).toMatchObject({
      author: ids.a.id,
    });
  });

  it("rejects duplicates over HTTP", async () => {
    expect(
      await status(r.client.create("posts", { title: "x", tags: [ids.t1.id, ids.t1.id] })),
    ).toBe(400);
  });
});

describe("relation filters", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });
  const get = (path: string) => r.cms.fetch(new Request(`${origin}/api/cms${path}`));

  it("filters by a single relation", async () => {
    expect((await r.cms.find("posts", { where: { author: ids.a.id } })).map((p) => p.id)).toEqual([
      ids.p.id,
    ]);
    expect(
      (await (await get(`/collections/posts?author=${ids.a.id}`)).json()).map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual([ids.p.id]);
  });

  it("rejects many relations and joins", async () => {
    await expect(r.cms.find("posts", { where: { tags: "x" } as never })).rejects.toThrow(
      /not filterable/,
    );
    await expect(r.cms.find("authors", { where: { posts: "x" } as never })).rejects.toThrow(
      /not filterable/,
    );
    expect((await get("/collections/posts?tags=x")).status).toBe(400);
    expect((await get("/collections/authors?posts=x")).status).toBe(400);
  });

  it("rejects many relations and joins at the type level", () => {
    () => {
      // @ts-expect-error many relations are not filterable
      r.cms.find("posts", { where: { tags: "x" } });
      // @ts-expect-error joins are not filterable
      r.cms.find("authors", { where: { posts: "x" } });
      // @ts-expect-error many relations are not filterable
      r.client.find("posts", { where: { tags: "x" } });
    };
  });
});

describe("populate", () => {
  let cms: ReturnType<typeof relational>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    cms = relational();
    ids = await seed(cms);
  });

  it("resolves relations up to the default depth", async () => {
    const { a, m } = ids;
    expect((await cms.find("posts"))[0]).toMatchObject({
      author: { id: a.id, name: "Ann", avatar: { id: m.id, url: "/a.png" } },
      tags: [{ name: "one" }, { name: "two" }],
      seo: { image: { url: "/a.png" } },
    });
  });

  it("returns ids with populate: false", async () => {
    const { a, m, t1, t2 } = ids;
    expect((await cms.find("posts", { populate: false }))[0]).toMatchObject({
      author: a.id,
      tags: [t1.id, t2.id],
      seo: { image: m.id },
    });
  });

  it("resolves a missing target to null and drops it from many", async () => {
    const url = tmpDb();
    const cms = relational(url);
    const { a, t2 } = await seed(cms);
    const db = createLibsql({ url });
    await db.execute({ sql: "DELETE FROM cms_documents WHERE id IN (?, ?)", args: [a.id, t2.id] });
    db.close();
    const post = (await cms.find("posts"))[0];
    expect(post.author).toBeNull();
    expect(post.tags).toMatchObject([{ name: "one" }]);
  });

  it("limits hops with depth", async () => {
    const { a, m } = ids;
    expect((await cms.find("posts", { depth: 1 }))[0].author?.avatar).toBe(m.id);
    expect((await cms.find("posts", { depth: 0 }))[0].author).toBe(a.id);
  });

  it("ends cycles at the depth limit", async () => {
    const x = await cms.create("pages", { title: "x" });
    const y = await cms.create("pages", { title: "y", parent: x.id });
    await cms.update("pages", x.id, { title: "x", parent: y.id });
    const doc = await cms.findById("pages", x.id, { depth: 3 });
    expect(doc?.parent?.id).toBe(y.id);
    expect(doc?.parent?.parent?.id).toBe(x.id);
    expect(doc?.parent?.parent?.parent?.id).toBe(y.id);
    expect(doc?.parent?.parent?.parent?.parent).toBe(x.id);
  });

  it("uses the config depth", async () => {
    const cms = relational(":memory:", { depth: 1 });
    const { m } = await seed(cms);
    expect((await cms.find("posts"))[0].author).toMatchObject({ avatar: m.id });
  });

  it("resolves only listed paths", async () => {
    const { m, t1, t2 } = ids;
    const post = (await cms.find("posts", { populate: { author: { avatar: true } } }))[0];
    expect(post.author?.avatar?.url).toBe("/a.png");
    expect(post.tags).toEqual([t1.id, t2.id]);
    expect(post.seo?.image).toBe(m.id);
  });

  it("resolves through groups", async () => {
    expect(
      (await cms.find("posts", { populate: { seo: { image: true } } }))[0].seo?.image?.url,
    ).toBe("/a.png");
    expect((await cms.find("posts", { populate: { seo: true } }))[0].seo?.image?.url).toBe(
      "/a.png",
    );
  });

  it("ignores depth with an object", async () => {
    expect(
      (await cms.find("posts", { populate: { author: true }, depth: 5 }))[0].author?.avatar,
    ).toBe(ids.m.id);
  });

  it("resolves a named join newest first", async () => {
    const { a, p } = ids;
    const p2 = await cms.create("posts", { title: "Two", author: a.id });
    const author = await cms.findById("authors", a.id, { populate: { posts: true } });
    expect(author?.posts.map((x) => x.id)).toEqual([p2.id, p.id]);
    expect(author?.posts[0].author).toBe(a.id);
  });

  it("leaves unnamed joins out", async () => {
    expect(await cms.findById("authors", ids.a.id)).not.toHaveProperty("posts");
  });

  it("joins over many relations and groups", async () => {
    const { m, t2, p } = ids;
    expect(
      (await cms.findById("tags", t2.id, { populate: { posts: true } }))?.posts.map((x) => x.id),
    ).toEqual([p.id]);
    expect(
      (await cms.findById("media", m.id, { populate: { usedIn: true } }))?.usedIn.map((x) => x.id),
    ).toEqual([p.id]);
    const b = await cms.create("authors", { name: "Bo" });
    expect((await cms.findById("authors", b.id, { populate: { posts: true } }))?.posts).toEqual([]);
  });

  it("nested paths go through a join", async () => {
    expect(
      (await cms.findById("authors", ids.a.id, { populate: { posts: { tags: true } } }))?.posts[0]
        .tags?.[0].name,
    ).toBe("one");
  });

  it("resolves global relations", async () => {
    const { m, p } = ids;
    await cms.setGlobal("site", { logo: m.id, featured: [p.id] });
    const site = await cms.getGlobal("site");
    expect(site.logo?.url).toBe("/a.png");
    expect(site.featured?.[0].author?.name).toBe("Ann");
    expect(await cms.getGlobal("site", { populate: false })).toEqual({
      logo: m.id,
      featured: [p.id],
    });
  });

  it("findById and findOne populate too", async () => {
    const { a, p } = ids;
    expect(await cms.findById("posts", p.id)).toMatchObject({ author: { id: a.id, name: "Ann" } });
    expect(await cms.findOne("posts", { where: { title: "Hi" } })).toMatchObject({
      author: { id: a.id, name: "Ann" },
    });
  });
});

describe("select", () => {
  let cms: ReturnType<typeof relational>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    cms = relational();
    ids = await seed(cms);
  });

  it("returns id and the selected fields from every read method", async () => {
    const { p } = ids;
    const expected = { id: p.id, title: "Hi", author: { id: ids.a.id, name: "Ann" } };
    const select = { title: true, author: { name: true } } as const;
    expect(await cms.find("posts", { select })).toEqual([expected]);
    expect(await cms.findOne("posts", { where: { title: "Hi" }, select })).toEqual(expected);
    expect(await cms.findById("posts", p.id, { select })).toEqual(expected);
    expect(await cms.findById("posts", p.id, { select: {} })).toEqual({ id: p.id });
    expect(await cms.findById("posts", p.id, { select: { createdAt: true } })).toEqual({
      id: p.id,
      createdAt: p.createdAt,
    });
  });

  it("selects inside a global and through a join", async () => {
    const { m, p, a } = ids;
    await cms.setGlobal("site", { logo: m.id, featured: [p.id] });
    expect(await cms.getGlobal("site", { select: { featured: { title: true } } })).toEqual({
      featured: [{ id: p.id, title: "Hi" }],
    });
    expect(
      await cms.findById("authors", a.id, {
        populate: { posts: true },
        select: { posts: { title: true } },
      }),
    ).toEqual({
      id: a.id,
      posts: [{ id: p.id, title: "Hi" }],
    });
  });

  it("rejects an unknown key, a nested object on a plain field and an unresolved relation", async () => {
    await expect(cms.find("posts", { select: { titel: true } } as never)).rejects.toThrow(
      "Invalid select: titel",
    );
    await expect(cms.find("posts", { select: { title: { x: true } } } as never)).rejects.toThrow(
      "Invalid select: title",
    );
    await expect(
      cms.find("posts", { populate: false, select: { author: { name: true } } } as never),
    ).rejects.toThrow("Invalid select: author");
    await expect(cms.getGlobal("site", { select: { nope: true } } as never)).rejects.toThrow(
      "Invalid select: nope",
    );
  });

  it("runs after afterRead and before afterOperation", async () => {
    const seen: string[][] = [];
    const keys = (d: object) => Object.keys(d).sort();
    const cms = defineCms({
      collections: {
        posts: {
          fields: { title: { type: "text" }, body: { type: "text" } },
          hooks: {
            afterRead: [
              ({ docs, operation }) => void (operation === "read" && seen.push(keys(docs[0]))),
            ],
            afterOperation: [
              ({ result, operation }) =>
                void (operation === "read" && seen.push(keys((result as object[])[0]))),
            ],
          },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    await cms.create("posts", { title: "a", body: "b" });
    await cms.find("posts", { select: { title: true } });
    expect(seen).toEqual([
      ["body", "createdAt", "id", "title", "updatedAt"],
      ["id", "title"],
    ]);
  });
});

describe("populate over HTTP", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });
  const get = async (path: string) => {
    const res = await r.cms.fetch(new Request(`${origin}/api/cms${path}`));
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  it("resolves relations by default", async () => {
    expect((await get("/collections/posts")).body[0].author.name).toBe("Ann");
  });

  it("reads populate and depth from the query", async () => {
    const { a, m, p } = ids;
    expect((await get("/collections/posts?populate=false")).body[0].author).toBe(a.id);
    expect((await get("/collections/posts?depth=1")).body[0].author.avatar).toBe(m.id);
    for (const q of ["seo.image", "seo"]) {
      const post = (await get(`/collections/posts?populate=${q}`)).body[0];
      expect(post.seo.image.url).toBe("/a.png");
      expect(post.author).toBe(a.id);
    }
    expect((await get(`/collections/authors/${a.id}?populate=posts`)).body.posts[0].id).toBe(p.id);
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await get("/globals/site?populate=false")).body).toEqual({ logo: m.id });
    expect((await get("/collections/posts?populate=false&title=Hi")).body).toHaveLength(1);
    expect((await get("/collections/posts?populate=false&title=No")).body).toHaveLength(0);
  });

  it("populates through the client", async () => {
    const { client } = r;
    const { a, m, p } = ids;
    expect(
      (await client.find("posts", { populate: { author: { avatar: true } } }))[0].author?.avatar
        ?.url,
    ).toBe("/a.png");
    expect((await client.findById("posts", p.id, { populate: false })).author).toBe(a.id);
    expect((await client.find("posts", { populate: {} }))[0].author).toBe(a.id);
    expect(
      (await client.findOne("posts", { where: { title: "Hi" }, populate: false }))?.author,
    ).toBe(a.id);
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await client.getGlobal("site", { depth: 0 })).logo).toBe(m.id);
    expect((await client.getGlobal("site")).logo?.url).toBe("/a.png");
  });

  it("types client reads", () => {
    async () => {
      const { client } = r;
      const s = await client.findById("posts", "x", {
        select: { title: true, author: { name: true } },
      });
      s.title satisfies string;
      s.author?.name satisfies string | undefined;
      // @ts-expect-error not selected
      s.tags;
      // @ts-expect-error unresolved relation
      client.find("posts", { populate: false, select: { author: { name: true } } });
      // @ts-expect-error unknown key
      client.getGlobal("site", { select: { nope: true } });
      const c = (await client.find("posts"))[0];
      const n: string = c.author!.name;
      // @ts-expect-error unknown populate key
      client.find("posts", { populate: { autor: true } });
      const ids = await client.findById("posts", "x", { populate: false });
      const aid: string | null | undefined = ids.author;
      const j = await client.findById("authors", "x", { populate: { posts: true } });
      const t: string = j.posts[0].title;
    };
  });

  it.each([
    ["?depth=6", "Invalid depth: 6"],
    ["?populate=title", "Invalid populate: title"],
    ["?populate=nope", "Invalid populate: nope"],
    [
      "?populate=author.posts.author.posts.author.posts",
      "Invalid populate: author.posts.author.posts.author.posts",
    ],
  ])("rejects %s", async (q, message) => {
    expect(await get(`/collections/posts${q}`)).toEqual({ status: 400, body: { message } });
    expect(await get(`/collections/posts/${ids.p.id}${q}`)).toEqual({
      status: 400,
      body: { message },
    });
    expect((await get(`/globals/site${q.replace("title", "nope")}`)).status).toBe(400);
  });
});

describe("select over HTTP", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });
  const get = async (path: string) => {
    const res = await r.cms.fetch(new Request(`${origin}/api/cms${path}`));
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  it("returns only the selected fields", async () => {
    const { p, a, m } = ids;
    const expected = { id: p.id, title: "Hi", author: { id: a.id, name: "Ann" } };
    expect((await get("/collections/posts?select=title,author.name")).body).toEqual([expected]);
    expect((await get(`/collections/posts/${p.id}?select=title,author.name`)).body).toEqual(
      expected,
    );
    expect((await get(`/collections/posts/${p.id}?select=`)).body).toEqual({ id: p.id });
    expect((await get(`/collections/posts/${p.id}?select=seo,seo.image.url`)).body).toEqual({
      id: p.id,
      seo: { image: { id: m.id, url: "/a.png" } },
    });
    await r.cms.setGlobal("site", { logo: m.id });
    expect((await get("/globals/site?select=logo.url")).body).toEqual({
      logo: { id: m.id, url: "/a.png" },
    });
  });

  it("selects through the client", async () => {
    const { client } = r;
    const { p, a, m } = ids;
    expect(
      await client.findById("posts", p.id, { select: { title: true, author: { name: true } } }),
    ).toEqual({
      id: p.id,
      title: "Hi",
      author: { id: a.id, name: "Ann" },
    });
    expect((await client.find("posts", { select: {} }))[0]).toEqual({ id: p.id });
    expect(
      await client.findOne("posts", {
        where: { title: "Hi" },
        populate: false,
        select: { author: true },
      }),
    ).toEqual({ id: p.id, author: a.id });
    await r.cms.setGlobal("site", { logo: m.id });
    expect(await client.getGlobal("site", { select: { logo: { url: true } } })).toEqual({
      logo: { id: m.id, url: "/a.png" },
    });
  });

  it("rejects meta keys where they do not exist", async () => {
    const { p } = ids;
    expect(await get(`/collections/posts/${p.id}?select=seo.id`)).toEqual({
      status: 400,
      body: { message: "Invalid select: seo.id" },
    });
    expect(await get("/globals/site?select=createdAt")).toEqual({
      status: 400,
      body: { message: "Invalid select: createdAt" },
    });
    await expect(r.cms.getGlobal("site", { select: { id: true } } as never)).rejects.toThrow(
      "Invalid select: id",
    );
  });

  it("rejects prototype keys without touching Object.prototype", async () => {
    for (const q of ["__proto__.polluted", "constructor.prototype.polluted", "__proto__"]) {
      expect(await get(`/collections/posts?select=${q}`)).toEqual({
        status: 400,
        body: { message: expect.stringMatching(/^Invalid select: /) },
      });
      expect((await get(`/collections/posts?populate=${q}`)).status).toBe(400);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("is a reserved param, not a filter", async () => {
    expect((await get("/collections/posts?select=title&title=Hi")).body).toHaveLength(1);
    expect((await get("/collections/posts?select=title&title=No")).body).toHaveLength(0);
  });

  it.each([
    ["?select=titel", "titel"],
    ["?select=title.x", "title"],
    ["?select=author.nope", "author.nope"],
    ["?populate=false&select=author.name", "author"],
    ["?depth=1&select=author.avatar.url", "author.avatar"],
    ["?populate=tags&select=author.name", "author"],
  ])("rejects %s", async (q, path) => {
    const body = { message: `Invalid select: ${path}` };
    expect(await get(`/collections/posts${q}`)).toEqual({ status: 400, body });
    expect(await get(`/collections/posts/${ids.p.id}${q}`)).toEqual({ status: 400, body });
  });

  it("rejects an unknown key on a global", async () => {
    expect(await get("/globals/site?select=nope")).toEqual({
      status: 400,
      body: { message: "Invalid select: nope" },
    });
  });
});

describe("onDelete", () => {
  let cms: ReturnType<typeof relational>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    cms = relational();
    ids = await seed(cms);
  });
  const ids0 = { populate: false } as const;

  it("set-null clears single, many, grouped and global references", async () => {
    const { m, a, p, t1, t2 } = ids;
    await cms.setGlobal("site", { logo: m.id, featured: [p.id] });
    await cms.delete("media", m.id);
    expect((await cms.findById("posts", p.id, ids0))?.seo).toEqual({ image: null });
    expect((await cms.findById("authors", a.id, ids0))?.avatar).toBeNull();
    expect((await cms.getGlobal("site", ids0)).logo).toBeNull();
    await cms.delete("tags", t1.id);
    expect((await cms.findById("posts", p.id, ids0))?.tags).toEqual([t2.id]);
  });

  it("set-null clears several fields of one document", async () => {
    const cms = defineCms({
      collections: {
        a: { fields: {} },
        b: {
          fields: {
            x: { type: "relation", collection: "a" },
            y: { type: "relation", collection: "a", many: true },
          },
        },
      },
      database: { url: ":memory:" },
      secret: "",
    });
    const a = await cms.create("a", {});
    const b = await cms.create("b", { x: a.id, y: [a.id] });
    await cms.delete("a", a.id);
    expect(await cms.findById("b", b.id, { populate: false })).toMatchObject({ x: null, y: [] });
  });

  it("set-null updates updatedAt", async () => {
    const { t1, p } = ids;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await cms.delete("tags", t1.id);
    expect((await cms.findById("posts", p.id))?.updatedAt).not.toBe(p.updatedAt);
  });
});

describe("onDelete restrict", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });

  it("blocks the delete and changes nothing", async () => {
    const { cms, client } = r;
    const { p } = ids;
    const pin = await cms.create("pages", { title: "p" });
    const note = await cms.create("notes", { post: p.id, pin: pin.id });
    await cms.setGlobal("site", { featured: [p.id] });
    await client.signUp(admin);
    const error = await client.delete("posts", p.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CmsError);
    expect(error).toMatchObject({ status: 409, message: "Referenced by other documents" });
    expect((error as CmsError).body).toEqual({
      message: "Referenced by other documents",
      references: [{ collection: "notes", id: note.id }],
    });
    expect(await cms.findById("posts", p.id)).toBeDefined();
    expect((await cms.getGlobal("site", { populate: false })).featured).toEqual([p.id]);
  });

  it("throws ConflictError locally", async () => {
    const pin = await r.cms.create("pages", { title: "p" });
    const note = await r.cms.create("notes", { post: ids.p.id, pin: pin.id });
    const error = await r.cms.delete("posts", ids.p.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ references: [{ collection: "notes", id: note.id }] });
  });

  it("applies explicit restrict and lists globals", async () => {
    const cms = defineCms({
      collections: {
        posts: { fields: {} },
        notes: {
          fields: { post: { type: "relation", collection: "posts", onDelete: "restrict" } },
        },
      },
      globals: {
        g: { fields: { pin: { type: "relation", collection: "posts", onDelete: "restrict" } } },
      },
      database: { url: ":memory:" },
      secret: "",
    });
    const p = await cms.create("posts", {});
    const note = await cms.create("notes", { post: p.id });
    await cms.setGlobal("g", { pin: p.id });
    await expect(cms.delete("posts", p.id)).rejects.toMatchObject({
      references: [{ collection: "notes", id: note.id }, { global: "g" }],
    });
  });
});

describe("onDelete cascade", () => {
  let cms: ReturnType<typeof relational>;
  beforeEach(() => {
    cms = relational();
  });
  const tree = async () => {
    const root = await cms.create("pages", { title: "root" });
    const child = await cms.create("pages", { title: "child", parent: root.id });
    const grandchild = await cms.create("pages", { title: "grandchild", parent: child.id });
    return [root, child, grandchild];
  };

  it("deletes recursively", async () => {
    const [root] = await tree();
    await cms.delete("pages", root.id);
    expect(await cms.find("pages")).toEqual([]);
  });

  it("ends cycles", async () => {
    const x = await cms.create("pages", { title: "x" });
    const y = await cms.create("pages", { title: "y", parent: x.id });
    await cms.update("pages", x.id, { title: "x", parent: y.id });
    await cms.delete("pages", x.id);
    expect(await cms.find("pages")).toEqual([]);
  });

  it("applies the rules of deleted documents", async () => {
    const [root, child] = await tree();
    const { p } = await seed(cms);
    await cms.create("notes", { post: p.id, pin: child.id });
    await expect(cms.delete("pages", root.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await cms.find("pages")).toHaveLength(3);
  });
});

describe("hooks", () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
  });
  const log = (name: string) => () => void calls.push(name);
  const db = { database: { url: ":memory:" }, secret: "x".repeat(32) };
  const title = { title: { type: "text", required: true } } as const;
  const writeStages = [
    "beforeOperation",
    "beforeValidate",
    "beforeChange",
    "afterChange",
    "afterRead",
    "afterOperation",
  ] as const;
  const logAll = (stages: readonly string[]) =>
    Object.fromEntries(stages.map((s) => [s, [log(s)]]));

  it("run in order on create and update", async () => {
    const cms = defineCms({
      ...db,
      collections: { posts: { fields: title, hooks: logAll(writeStages) } },
    });
    const post = await cms.create("posts", { title: "a" });
    await cms.update("posts", post.id, { title: "b" });
    expect(calls).toEqual([...writeStages, ...writeStages]);
  });

  it("accept arrays and records in key order", async () => {
    const make = (beforeChange: (() => void)[] | Record<string, () => void>) =>
      defineCms({ ...db, collections: { posts: { fields: title, hooks: { beforeChange } } } });
    await make({ b: log("b"), a: log("a") }).create("posts", { title: "x" });
    await make([log("b"), log("a")]).create("posts", { title: "x" });
    expect(calls).toEqual(["b", "a", "b", "a"]);
  });

  it("use a returned value and keep the input on undefined", async () => {
    const posts = defineCollection({
      fields: title,
      hooks: {
        beforeValidate: [({ data }) => ({ ...data, title: data.title?.trim() }), () => undefined],
        afterChange: [({ doc }) => ({ ...doc, extra: 1 })],
        afterOperation: [({ result }) => ({ ...(result as object), op: 1 })],
      },
    });
    const cms = defineCms({ ...db, collections: { posts } });
    const post = await cms.create("posts", { title: "  Hi  " });
    expect(post).toMatchObject({ title: "Hi", extra: 1, op: 1 });
    const stored = await cms.findById("posts", post.id);
    expect(stored?.title).toBe("Hi");
    expect(stored).not.toHaveProperty("extra");
  });

  it("pass operation, id and originalDoc", async () => {
    const seen: Record<string, unknown>[] = [];
    const posts = defineCollection({
      fields: title,
      hooks: {
        beforeChange: [
          ({ operation, id, originalDoc, data }) =>
            void seen.push({ operation, id, original: originalDoc?.title, data: data.title }),
        ],
        afterChange: [
          ({ operation, previousDoc, doc }) =>
            void seen.push({ operation, previous: previousDoc?.title, doc: doc.title }),
        ],
      },
    });
    const cms = defineCms({ ...db, collections: { posts } });
    const post = await cms.create("posts", { title: "a" });
    await cms.update("posts", post.id, { title: "b" });
    expect(seen).toEqual([
      { operation: "create", id: undefined, original: undefined, data: "a" },
      { operation: "create", previous: undefined, doc: "a" },
      { operation: "update", id: post.id, original: "a", data: "b" },
      { operation: "update", previous: "a", doc: "b" },
    ]);
  });

  it("validate the beforeChange result", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        posts: { fields: title, hooks: { beforeChange: [({ data }) => ({ ...data, title: "" })] } },
      },
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    const error = await client.create("posts", { title: "a" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, body: { errors: { title: expect.any(String) } } });
    expect(await cms.find("posts")).toEqual([]);
  });

  it("run in order on reads", async () => {
    const stages = ["beforeOperation", "beforeRead", "afterRead", "afterOperation"];
    const cms = defineCms({
      ...db,
      collections: { posts: { fields: title, hooks: logAll(stages) } },
    });
    const post = await cms.create("posts", { title: "a" });
    calls = [];
    await cms.find("posts");
    await cms.findOne("posts", { where: { title: "a" } });
    await cms.findById("posts", post.id);
    expect(calls).toEqual([...stages, ...stages, ...stages]);
  });

  it("run afterRead once per find with all docs", async () => {
    const counts: number[] = [];
    const posts = defineCollection({
      fields: title,
      hooks: {
        afterRead: [
          ({ docs, operation }) => {
            if (operation === "read") counts.push(docs.length);
            return docs.map((d) => ({ ...d, title: d.title.toUpperCase() }));
          },
        ],
      },
    });
    const cms = defineCms({ ...db, collections: { posts } });
    for (const t of ["a", "b", "c"]) await cms.create("posts", { title: t });
    expect((await cms.find("posts")).map((p) => p.title)).toEqual(["C", "B", "A"]);
    expect(counts).toEqual([3]);
  });

  it("run in order on delete", async () => {
    const seen: unknown[] = [];
    const record = ({ id, doc }: { id: string; doc: { title: string } }) =>
      void seen.push([id, doc.title]);
    const hooks = {
      ...logAll(["beforeOperation", "afterOperation"]),
      beforeDelete: [log("beforeDelete"), record],
      afterDelete: [log("afterDelete"), record],
    };
    const cms = defineCms({ ...db, collections: { posts: { fields: title, hooks } } });
    const post = await cms.create("posts", { title: "a" });
    calls = [];
    await cms.delete("posts", post.id);
    expect(calls).toEqual(["beforeOperation", "beforeDelete", "afterDelete", "afterOperation"]);
    expect(seen).toEqual([
      [post.id, "a"],
      [post.id, "a"],
    ]);
    calls = [];
    await cms.delete("posts", "missing");
    expect(calls).toEqual(["beforeOperation", "afterOperation"]);
  });

  it("run field hooks before collection hooks, depth-first into groups", async () => {
    const fieldStages = ["beforeValidate", "beforeChange", "afterChange", "afterRead"] as const;
    const fieldLog = Object.fromEntries(
      fieldStages.map((stage) => [
        stage,
        [({ path }: { path: string }) => void calls.push(`${path}:${stage}`)],
      ]),
    );
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: { type: "text", hooks: fieldLog },
            seo: {
              type: "group",
              hooks: fieldLog,
              fields: { title: { type: "text", hooks: fieldLog } },
            },
          },
          hooks: logAll(writeStages),
        },
      },
    });
    await cms.create("posts", { title: "a", seo: { title: "b" } });
    expect(calls).toEqual([
      "beforeOperation",
      ...fieldStages.flatMap((stage) =>
        ["title", "seo", "seo.title"].map((path) => `${path}:${stage}`).concat(stage),
      ),
      "afterOperation",
    ]);
  });

  it("give field hooks value, siblingData and path", async () => {
    const seen: unknown[] = [];
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: { type: "text" },
            seo: {
              type: "group",
              fields: {
                title: {
                  type: "text",
                  hooks: {
                    beforeChange: [
                      ({ value, siblingData, data, path }) => {
                        seen.push(path, { ...siblingData });
                        return value ?? (data.title as string);
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    });
    const post = await cms.create("posts", { title: "A", seo: {} });
    expect(post.seo?.title).toBe("A");
    expect(seen).toEqual(["seo.title", {}]);
  });

  it("run field afterRead once per value", async () => {
    let count = 0;
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: {
              type: "text",
              hooks: { afterRead: [() => void count++, ({ value }) => value?.toUpperCase()] },
            },
          },
        },
      },
    });
    for (const t of ["a", "b", "c"]) await cms.create("posts", { title: t });
    count = 0;
    expect((await cms.find("posts")).map((p) => p.title)).toEqual(["C", "B", "A"]);
    expect(count).toBe(3);
  });

  it("run on globals", async () => {
    const seen: unknown[] = [];
    const stages = ["beforeValidate", "beforeChange", "afterChange", "beforeRead", "afterRead"];
    const site = defineGlobal({
      fields: {
        name: { type: "text", hooks: { beforeChange: [({ path }) => void calls.push(path)] } },
      },
      hooks: {
        ...logAll(stages),
        afterRead: [
          log("afterRead"),
          ({ docs, global, operation }) => void seen.push([docs.length, global, operation]),
        ],
      },
    });
    const cms = defineCms({ ...db, collections: {}, globals: { site } });
    expect(await cms.setGlobal("site", { name: "a" })).toEqual({ name: "a" });
    expect(calls).toEqual(["beforeValidate", "name", "beforeChange", "afterChange", "afterRead"]);
    calls = [];
    expect(await cms.getGlobal("site")).toEqual({ name: "a" });
    expect(calls).toEqual(["beforeRead", "afterRead"]);
    expect(seen).toEqual([
      [1, "site", "setGlobal"],
      [1, "site", "getGlobal"],
    ]);
    const renamed = defineCms({
      ...db,
      collections: {},
      globals: {
        site: {
          fields: { name: { type: "text" } },
          hooks: { afterRead: [({ docs }) => [{ ...docs[0], name: "X" }]] },
        },
      },
    });
    expect(await renamed.getGlobal("site")).toEqual({ name: "X" });
  });

  it("validate the beforeChange result of a global", async () => {
    const cms = defineCms({
      ...db,
      collections: {},
      globals: { site: { fields: title, hooks: { beforeChange: [() => ({ title: "" })] } } },
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    expect(await status(client.setGlobal("site", { title: "a" }))).toBe(400);
    expect(await cms.getGlobal("site")).toEqual({});
  });

  it("get the session user on HTTP writes", async () => {
    const seen: unknown[] = [];
    const record = ({ user }: { user: { email: string } | null }) =>
      void seen.push(user?.email ?? null);
    const cms = defineCms({
      ...db,
      collections: {
        logs: { fields: {}, hooks: { beforeChange: [record] } },
        posts: {
          fields: title,
          hooks: {
            beforeChange: [record],
            afterChange: [async ({ cms }) => void (await cms.create("logs", {}))],
            afterRead: [record],
          },
        },
      },
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    await client.create("posts", { title: "a" });
    expect(seen).toEqual(["a@b.co", "a@b.co", "a@b.co"]);
    seen.length = 0;
    await client.find("posts");
    await cms.create("posts", { title: "b" });
    expect(seen).toEqual([null, null, null, null]);
  });

  it("share context with nested calls", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        logs: {
          fields: { message: { type: "text" } },
          hooks: {
            beforeChange: [({ data, context }) => ({ ...data, message: String(context.source) })],
          },
        },
        posts: {
          fields: title,
          hooks: {
            beforeChange: [({ context }) => void (context.source = "posts")],
            afterChange: [async ({ cms }) => void (await cms.create("logs", { message: "x" }))],
          },
        },
      },
    });
    await cms.create("posts", { title: "a" });
    expect((await cms.find("logs")).map((l) => l.message)).toEqual(["posts"]);
    await cms.create("logs", { message: "x" });
    expect((await cms.find("logs")).map((l) => l.message)).toEqual(["undefined", "posts"]);
  });

  it("stop a loop with context", async () => {
    const posts = defineCollection({
      fields: { ...title, views: { type: "number" } },
      hooks: {
        afterChange: [
          async ({ doc, cms, context }) => {
            calls.push("afterChange");
            if (context.counted) return;
            context.counted = true;
            await cms.update("posts", doc.id, { title: doc.title, views: (doc.views ?? 0) + 1 });
          },
        ],
      },
    });
    const cms = defineCms({ ...db, collections: { posts } });
    const post = await cms.create("posts", { title: "a" });
    expect(calls).toHaveLength(2);
    expect((await cms.findById("posts", post.id))?.views).toBe(1);
  });

  it("are not sent in /schema", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: { type: "text", hooks: { afterRead: [log("f")] } },
            hooks: { type: "text" },
          },
          hooks: { beforeChange: [log("a")], afterRead: { b: log("b") } },
        },
      },
      globals: { site: { fields: {}, hooks: { afterRead: [log("g")] } } },
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    const schema = await client.getSchema();
    expect(schema.collections?.posts.fields.hooks).toEqual({ type: "text" });
    expect(JSON.stringify(schema).replace('"hooks":{"type":"text"}', "")).not.toContain("hooks");
  });

  it("are not sent in /schema, and neither are validate and function defaults", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            status: {
              type: "select",
              options: ["draft", "live"],
              default: "draft",
              condition: { owner: { exists: true } },
            },
            owner: {
              type: "text",
              default: () => "x",
              validate: () => true,
              hooks: { beforeChange: [log("f")] },
            },
          },
        },
      },
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    const schema = await client.getSchema();
    expect(JSON.stringify(schema)).not.toMatch(/validate|hooks/);
    expect(schema.collections?.posts.fields.owner).not.toHaveProperty("default");
    expect(schema.collections?.posts.fields.status).toMatchObject({
      default: "draft",
      condition: { owner: { exists: true } },
    });
  });
});

describe("transactions", () => {
  const db = { database: { url: ":memory:" }, secret: "x".repeat(32) };
  const logs = { fields: { message: { type: "text" } } } as const;

  it("roll back the write and nested writes", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        logs,
        posts: {
          fields: { title: { type: "text" } },
          hooks: {
            afterChange: [
              async ({ cms }) => {
                await cms.create("logs", { message: "x" });
                throw new Error("boom");
              },
            ],
          },
        },
      },
    });
    await expect(cms.create("posts", { title: "a" })).rejects.toThrow("boom");
    expect(await cms.find("posts")).toEqual([]);
    expect(await cms.find("logs")).toEqual([]);
  });

  it("nested calls run on the write's transaction", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        logs,
        posts: {
          fields: { title: { type: "text" }, log: { type: "text" } },
          hooks: {
            beforeChange: [
              async ({ cms, data }) => {
                await cms.find("logs");
                return { ...data, log: (await cms.create("logs", { message: "x" })).id };
              },
            ],
            afterChange: [async ({ cms, doc }) => void (await cms.findById("logs", doc.log))],
          },
        },
      },
    });
    await cms.create("posts", { title: "a" });
    expect(await cms.find("logs")).toHaveLength(1);
  });
});

describe("afterError", () => {
  let calls: unknown[];
  beforeEach(() => {
    calls = [];
  });
  const make = (
    throwing: () => void,
    afterError = (a: { operation: string; collection?: string; global?: string }) =>
      void calls.push(a),
  ) =>
    defineCms({
      hooks: {
        afterError: [
          ({ operation, collection, global }) =>
            void calls.push(["root", operation, collection ?? global]),
        ],
      },
      collections: {
        posts: {
          fields: { title: { type: "text" } },
          hooks: {
            afterError: [
              ({ operation, collection }) => void calls.push(["collection", operation, collection]),
              afterError,
            ],
            beforeChange: [throwing],
          },
        },
        notes: {
          fields: { post: { type: "relation", collection: "posts", required: true } },
          hooks: { afterError: [() => void calls.push("notes")] },
        },
        wrappers: {
          fields: {},
          hooks: {
            afterError: [() => void calls.push("wrappers")],
            beforeChange: [async ({ cms }) => void (await cms.create("posts", { title: "x" }))],
          },
        },
      },
      globals: { site: { fields: {}, hooks: { beforeChange: [throwing] } } },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });

  it("runs collection then root hooks and hides the message over HTTP", async () => {
    const cms = make(
      () => {
        throw new Error("secret");
      },
      () => undefined,
    );
    await expect(cms.create("posts", { title: "a" })).rejects.toThrow("secret");
    expect(calls).toEqual([
      ["collection", "create", "posts"],
      ["root", "create", "posts"],
    ]);
    const { client, fetch } = setup(cms);
    await client.signUp(admin);
    const res = await fetch(`${origin}/api/cms/collections/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
  });

  it("does not run for ValidationError or ConflictError", async () => {
    const cms = make(() => {
      throw new ValidationError({ title: "Taken" });
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    expect(await client.create("posts", { title: "a" }).catch((e: unknown) => e)).toMatchObject({
      status: 400,
      body: { errors: { title: "Taken" } },
    });
    const ok = make(() => undefined);
    const post = await ok.create("posts", { title: "a" });
    await ok.create("notes", { post: post.id });
    await expect(ok.delete("posts", post.id)).rejects.toBeInstanceOf(ConflictError);
    expect(calls).toEqual([]);
  });

  it("runs only the root hooks for a global", async () => {
    const cms = make(() => {
      throw new Error("boom");
    });
    await expect(cms.setGlobal("site", {})).rejects.toThrow("boom");
    expect(calls).toEqual([["root", "setGlobal", "site"]]);
  });

  it("keeps the original error when a hook throws", async () => {
    const cms = make(
      () => {
        throw new Error("first");
      },
      () => {
        throw new Error("second");
      },
    );
    await expect(cms.create("posts", { title: "a" })).rejects.toThrow("first");
    expect(calls).toEqual([
      ["collection", "create", "posts"],
      ["root", "create", "posts"],
    ]);
  });

  it("runs once, for the outer operation of a nested call", async () => {
    const cms = make(
      () => {
        throw new Error("boom");
      },
      () => undefined,
    );
    await expect(cms.create("wrappers", {})).rejects.toThrow("boom");
    expect(calls).toEqual(["wrappers", ["root", "create", "wrappers"]]);
  });
});

describe("root hooks", () => {
  const calls: string[] = [];
  const log =
    (where: string, stage: string) =>
    ({ collection, global }: { collection?: string; global?: string }) =>
      void calls.push(`${where}:${stage}:${collection ?? global}`);
  const stages = [
    "beforeOperation",
    "beforeValidate",
    "beforeChange",
    "afterChange",
    "beforeRead",
    "afterRead",
    "beforeDelete",
    "afterDelete",
    "afterOperation",
  ] as const;
  const hooksOf = (where: string) =>
    Object.fromEntries(stages.map((stage) => [stage, [log(where, stage)]]));
  const make = () =>
    defineCms({
      hooks: {
        ...hooksOf("root"),
        // A root hook MAY replace the main value, like a collection hook.
        afterRead: [log("root", "afterRead"), ({ docs }) => docs.map((d) => ({ ...d, seen: 1 }))],
      },
      collections: { posts: { fields: { title: { type: "text" } }, hooks: hooksOf("posts") } },
      globals: { site: { fields: { name: { type: "text" } } } },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
  beforeEach(() => void calls.splice(0));

  it("run after the collection's hooks in every stage", async () => {
    const cms = make();
    const post = await cms.create("posts", { title: "a" });
    expect(post).toMatchObject({ seen: 1 });
    expect(calls).toEqual([
      "posts:beforeOperation:posts",
      "root:beforeOperation:posts",
      "posts:beforeValidate:posts",
      "root:beforeValidate:posts",
      "posts:beforeChange:posts",
      "root:beforeChange:posts",
      "posts:afterChange:posts",
      "root:afterChange:posts",
      "posts:afterRead:posts",
      "root:afterRead:posts",
      "posts:afterOperation:posts",
      "root:afterOperation:posts",
    ]);
    calls.splice(0);
    await cms.find("posts");
    expect(calls).toEqual([
      "posts:beforeOperation:posts",
      "root:beforeOperation:posts",
      "posts:beforeRead:posts",
      "root:beforeRead:posts",
      "posts:afterRead:posts",
      "root:afterRead:posts",
      "posts:afterOperation:posts",
      "root:afterOperation:posts",
    ]);
    calls.splice(0);
    await cms.delete("posts", post.id);
    expect(calls).toEqual([
      "posts:beforeOperation:posts",
      "root:beforeOperation:posts",
      "posts:beforeDelete:posts",
      "root:beforeDelete:posts",
      "posts:afterDelete:posts",
      "root:afterDelete:posts",
      "posts:afterOperation:posts",
      "root:afterOperation:posts",
    ]);
  });

  it("run the global stages for globals", async () => {
    const cms = make();
    await cms.setGlobal("site", { name: "x" });
    expect(await cms.getGlobal("site")).toMatchObject({ seen: 1 });
    expect(calls).toEqual([
      "root:beforeValidate:site",
      "root:beforeChange:site",
      "root:afterChange:site",
      "root:afterRead:site",
      "root:beforeRead:site",
      "root:afterRead:site",
    ]);
  });
});

describe("plugins", () => {
  const calls: string[] = [];
  beforeEach(() => void calls.splice(0));
  const audit = definePlugin({
    name: "audit",
    collections: { logs: { fields: { message: { type: "text", required: true } } } },
    globals: { auditSettings: { fields: { enabled: { type: "boolean" } } } },
    hooks: {
      afterChange: [({ collection, global }) => void calls.push(`audit:${collection ?? global}`)],
    },
  });
  const make = () =>
    defineCms({
      ...base,
      collections: {
        posts: {
          fields: { title: { type: "text" }, log: { type: "relation", collection: "logs" } },
          hooks: { afterChange: [() => void calls.push("posts")] },
        },
      },
      hooks: { afterChange: [() => void calls.push("root")] },
      plugins: [audit],
    });

  it("add collections and globals", async () => {
    const cms = make();
    const log = await cms.create("logs", { message: "hi" });
    expect(log.message.toUpperCase()).toBe("HI");
    await cms.setGlobal("auditSettings", { enabled: true });
    expect((await cms.getGlobal("auditSettings")).enabled).toBe(true);
    // The host's relation points to the plugin's collection.
    const post = await cms.create("posts", { title: "a", log: log.id });
    expect((await cms.findById("posts", post.id))?.log).toMatchObject({ message: "hi" });
    expect(Object.keys(cms.schema.collections!)).toEqual(["posts", "logs"]);
    // @ts-expect-error unknown collection
    await expect(cms.find("nope")).rejects.toThrow();
  });

  it("run their hooks after the collection's and before the host's root hooks", async () => {
    await make().create("posts", { title: "a" });
    expect(calls).toEqual(["posts", "audit:posts", "root"]);
  });

  it("mount routes behind the session and publicRoutes before it", async () => {
    const stats = definePlugin({
      name: "stats",
      routes: (api) => {
        api.get("/me", async (c) =>
          c.json({ email: c.var.user.email, posts: (await c.var.cms.find("posts")).length }),
        );
        api.post("/fail", () => {
          throw new ValidationError({ title: "Nope" });
        });
      },
      publicRoutes: (api) =>
        api.get("/count", async (c) => c.json({ count: (await c.var.cms.find("posts")).length })),
    });
    const cms = defineCms({ ...base, plugins: [stats] });
    await cms.create("posts", { title: "a" });
    const { client, fetch } = setup(cms);
    const get = (path: string) => fetch(`${origin}/api/cms/stats${path}`);
    expect(await (await get("/count")).json()).toEqual({ count: 1 });
    expect((await get("/me")).status).toBe(401);
    await client.signUp(admin);
    expect(await (await get("/me")).json()).toEqual({ email: admin.email, posts: 1 });
    const res = await fetch(`${origin}/api/cms/stats/fail`, { method: "POST" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ errors: { title: "Nope" } });
    expect((await get("/nope")).status).toBe(404);
    expect(await client.request<{ count: number }>("/stats/count")).toEqual({ count: 1 });
    expect(await status(client.request("/stats/fail", { method: "POST" }))).toBe(400);
  });

  it("reject duplicate and invalid names", () => {
    const posts = { fields: { title: { type: "text" } } } as const;
    const withPlugins =
      (...plugins: Parameters<typeof definePlugin>[0][]) =>
      () =>
        defineCms({ ...base, plugins });
    expect(withPlugins({ name: "x", collections: { posts } })).toThrow('collection "posts"');
    expect(withPlugins({ name: "x", globals: { site: posts } })).toThrow('global "site"');
    expect(withPlugins({ name: "x", collections: { a: posts } }, { name: "x" })).toThrow(
      'plugin "x"',
    );
    expect(withPlugins({ name: "a" }, { name: "b", collections: { a: posts } })).not.toThrow();
    expect(
      withPlugins(
        { name: "a", collections: { a: posts } },
        { name: "b", collections: { a: posts } },
      ),
    ).toThrow('collection "a"');
    expect(withPlugins({ name: "Bad Name" })).toThrow('plugin name "Bad Name"');
    expect(withPlugins({ name: "auth" })).toThrow('plugin name "auth"');
  });
});

describe("populated hooks", () => {
  it("run read hooks on populated documents once per collection per hop", async () => {
    const calls: string[] = [];
    let seen: unknown;
    const count = ({ docs, collection }: { docs: unknown[]; collection?: string }) =>
      void calls.push(`${collection}:${docs.length}`);
    const cms = defineCms({
      collections: {
        authors: {
          fields: {
            name: { type: "text", hooks: { afterRead: [({ value }) => value?.toUpperCase()] } },
            posts: { type: "join", collection: "posts", on: "author" },
          },
          hooks: { beforeRead: [({ context }) => void (context.seen = true)], afterRead: [count] },
        },
        tags: { fields: { name: { type: "text" } }, hooks: { afterRead: [count] } },
        posts: {
          fields: {
            title: { type: "text" },
            author: { type: "relation", collection: "authors" },
            tags: { type: "relation", collection: "tags", many: true },
          },
          hooks: { afterRead: [({ context }) => void (seen = context.seen), count] },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    const [a1, a2] = [
      await cms.create("authors", { name: "ann" }),
      await cms.create("authors", { name: "bo" }),
    ];
    const [t1, t2] = [
      await cms.create("tags", { name: "x" }),
      await cms.create("tags", { name: "y" }),
    ];
    await cms.create("posts", { title: "1", author: a1.id, tags: [t1.id] });
    await cms.create("posts", { title: "2", author: a2.id, tags: [t1.id, t2.id] });
    await cms.create("posts", { title: "3", author: a1.id });
    calls.length = 0;
    const posts = await cms.find("posts");
    expect(calls.sort()).toEqual(["authors:2", "posts:3", "tags:2"]);
    expect(seen).toBe(true);
    expect(posts.map((p) => p.author?.name)).toEqual(["ANN", "BO", "ANN"]);
    calls.length = 0;
    expect(
      (await cms.findById("authors", a1.id, { populate: { posts: true } }))?.posts,
    ).toHaveLength(2);
    expect(calls.sort()).toEqual(["authors:1", "posts:2"]);
  });
});

describe("onDelete hooks", () => {
  let calls: unknown[] = [];
  const make = (fail = false) =>
    defineCms({
      collections: {
        authors: { fields: { name: { type: "text" } } },
        posts: {
          fields: {
            title: { type: "text" },
            author: { type: "relation", collection: "authors", onDelete: "set-null" },
          },
          hooks: {
            beforeChange: [
              ({ operation, data }) => {
                calls.push(["beforeChange", operation, data.author]);
                if (fail && operation === "update") throw new Error("boom");
              },
            ],
            afterChange: [
              ({ operation, doc }) => void calls.push(["afterChange", operation, doc.author]),
            ],
          },
        },
        comments: {
          fields: { post: { type: "relation", collection: "posts", onDelete: "cascade" } },
          hooks: {
            beforeDelete: [({ id }) => void calls.push(["beforeDelete", id])],
            afterDelete: [({ id }) => void calls.push(["afterDelete", id])],
          },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
  const seed = async (cms: ReturnType<typeof make>) => {
    const author = await cms.create("authors", { name: "a" });
    const post = await cms.create("posts", { title: "p", author: author.id });
    const comment = await cms.create("comments", { post: post.id });
    calls = [];
    return { author, post, comment };
  };

  it("run the referencing collection's update and delete hooks", async () => {
    const cms = make();
    const { author, post, comment } = await seed(cms);
    await cms.delete("authors", author.id);
    expect(calls).toEqual([
      ["beforeChange", "update", null],
      ["afterChange", "update", null],
    ]);
    calls = [];
    await cms.delete("posts", post.id);
    expect(calls).toEqual([
      ["beforeDelete", comment.id],
      ["afterDelete", comment.id],
    ]);
  });

  it("roll back the delete when an effect hook throws", async () => {
    const cms = make(true);
    const { author } = await seed(cms);
    await expect(cms.delete("authors", author.id)).rejects.toThrow("boom");
    expect(await cms.findById("authors", author.id)).toBeDefined();
  });

  it("clear a reference whose other relation points to a document deleted in the same cascade", async () => {
    const other = defineCms({
      collections: {
        pages: {
          fields: { parent: { type: "relation", collection: "pages", onDelete: "cascade" } },
        },
        links: {
          fields: {
            a: { type: "relation", collection: "pages" },
            b: { type: "relation", collection: "pages" },
          },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    const x = await other.create("pages", {});
    const y = await other.create("pages", { parent: x.id });
    const z = await other.create("pages", { parent: y.id });
    const link = await other.create("links", { a: z.id, b: y.id });
    await other.delete("pages", x.id);
    expect(await other.find("pages")).toEqual([]);
    expect(await other.findById("links", link.id, { populate: false })).toMatchObject({
      a: null,
      b: null,
    });
  });
});

describe("condition", () => {
  const make = (hooks = {}) =>
    defineCms({
      collections: {
        media: {
          fields: {
            mediaType: { type: "select", options: ["image", "youtube"] },
            url: { type: "text", required: true, condition: { mediaType: "youtube" } },
          },
          hooks,
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });

  it("lets a required field be missing while its condition is false", async () => {
    await expect(make().create("media", { mediaType: "image" })).resolves.toMatchObject({
      mediaType: "image",
    });
    await expect(make().create("media", { mediaType: "youtube" })).rejects.toMatchObject({
      errors: { url: expect.any(String) },
    });
  });

  it("keeps values of fields whose condition is false", async () => {
    const cms = make();
    const doc = await cms.create("media", { mediaType: "image", url: "x" });
    expect(await cms.findById("media", doc.id)).toMatchObject({ url: "x" });
  });

  it("checks the field again after beforeChange", async () => {
    const cms = make({
      beforeChange: [
        ({ data }: { data: Record<string, unknown> }) => ({ mediaType: "youtube", url: data.url }),
      ],
    });
    await expect(cms.create("media", { mediaType: "image" })).rejects.toMatchObject({
      errors: { url: expect.any(String) },
    });
  });

  it("keeps the type check while the condition is false", async () => {
    await expect(make().create("media", { mediaType: "image", url: 5 })).rejects.toMatchObject({
      errors: { url: expect.any(String) },
    });
  });
});

describe("default", () => {
  let seen: unknown[] = [];
  const make = () =>
    defineCms({
      collections: {
        items: {
          fields: {
            status: { type: "select", options: ["draft", "live"], default: "draft" },
            owner: { type: "text", default: async ({ user }) => user?.email ?? "system" },
            tags: { type: "relation", collection: "items", many: true, default: [] },
            meta: {
              type: "group",
              fields: {
                lang: { type: "text", default: "en" },
                title: { type: "text", required: true, default: "T" },
              },
            },
          },
          hooks: { beforeValidate: [({ data }) => void seen.push(data.status)] },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });

  it("fills undefined fields on create", async () => {
    const cms = make();
    const { client } = setup(cms);
    await client.signUp(admin);
    expect(await client.create("items", {})).toMatchObject({
      status: "draft",
      owner: "a@b.co",
      tags: [],
    });
    expect(await cms.create("items", {})).toMatchObject({ status: "draft", owner: "system" });
  });

  it("fills group children only when the group is sent", async () => {
    const cms = make();
    expect(await cms.create("items", { meta: {} })).toMatchObject({
      meta: { lang: "en", title: "T" },
    });
    expect(await cms.create("items", {})).not.toHaveProperty("meta");
  });

  it("does not replace null", async () => {
    expect(await make().create("items", { status: null })).toMatchObject({ status: null });
  });

  it("does not apply on update", async () => {
    const cms = make();
    const item = await cms.create("items", { status: null });
    expect(await cms.update("items", item.id, {})).toMatchObject({ status: null });
  });

  it("runs before beforeValidate", async () => {
    seen = [];
    await make().create("items", {});
    expect(seen).toEqual(["draft"]);
  });
});

describe("validate", () => {
  let calls: unknown[] = [];
  const make = () =>
    defineCms({
      collections: {
        events: {
          fields: {
            kind: { type: "text" },
            start: { type: "date" },
            end: {
              type: "date",
              validate: (v, { siblingData }) =>
                !v || v >= String(siblingData.start) || "Ends before start",
            },
            code: { type: "text", validate: async (v) => v !== "x" || "Not allowed" },
            seo: {
              type: "group",
              fields: {
                title: {
                  type: "text",
                  validate: (v, { path, operation }) => (calls.push([path, operation, v]), true),
                },
              },
            },
            url: { type: "text", condition: { kind: "link" }, validate: () => "Always wrong" },
          },
          hooks: { beforeChange: [() => void calls.push("beforeChange")] },
        },
        owners: { fields: { name: { type: "text" } } },
        things: {
          fields: {
            owner: { type: "relation", collection: "owners" },
            code: {
              type: "text",
              validate: (v, { operation }) => operation === "create" || "Locked",
            },
          },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
  beforeEach(() => {
    calls = [];
  });

  it("collects all messages in one 400", async () => {
    const cms = make();
    const { client } = setup(cms);
    await client.signUp(admin);
    const error = await client
      .create("events", { start: "2026-02-01", end: "2026-01-01", code: "x" })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 400,
      body: {
        message: expect.any(String),
        errors: { end: "Ends before start", code: "Not allowed" },
      },
    });
    expect(calls).not.toContain("beforeChange");
  });

  it("passes the path of group children", async () => {
    await make().create("events", { seo: { title: "T" } });
    expect(calls).toContainEqual(["seo.title", "create", "T"]);
  });

  it("skips fields whose condition is false", async () => {
    const cms = make();
    await expect(cms.create("events", { url: "u" })).resolves.toMatchObject({ url: "u" });
    await expect(cms.create("events", { kind: "link", url: "u" })).rejects.toMatchObject({
      errors: { url: "Always wrong" },
    });
  });

  it("is skipped on set-null updates", async () => {
    const cms = make();
    const owner = await cms.create("owners", { name: "o" });
    const thing = await cms.create("things", { owner: owner.id, code: "c" });
    await cms.delete("owners", owner.id);
    expect(await cms.findById("things", thing.id, { populate: false })).toMatchObject({
      owner: null,
      code: "c",
    });
    await expect(cms.update("things", thing.id, { code: "c" })).rejects.toMatchObject({
      errors: { code: "Locked" },
    });
  });
});

describe("unique", () => {
  const make = () =>
    defineCms({
      collections: {
        tags: {
          fields: {
            name: { type: "text" },
            slug: { type: "text", unique: true },
            rank: { type: "number", unique: true },
          },
          hooks: {
            beforeChange: [({ data }) => (data.name ? { ...data, slug: data.name } : undefined)],
          },
        },
        other: { fields: { slug: { type: "text" } } },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });

  it("rejects a used value", async () => {
    const cms = make();
    const { client } = setup(cms);
    await client.signUp(admin);
    await client.create("tags", { slug: "a", rank: 1 });
    const error = await client.create("tags", { slug: "a" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, body: { errors: { slug: "Already used" } } });
    await expect(cms.create("tags", { rank: 1 })).rejects.toMatchObject({
      errors: { rank: "Already used" },
    });
  });

  it("is case-sensitive and per collection", async () => {
    const cms = make();
    await cms.create("other", { slug: "a" });
    await cms.create("tags", { slug: "a" });
    await expect(cms.create("tags", { slug: "A" })).resolves.toBeDefined();
  });

  it("never matches null or missing", async () => {
    const cms = make();
    await cms.create("tags", {});
    await cms.create("tags", {});
    await cms.create("tags", { slug: null });
    await expect(cms.create("tags", { slug: null })).resolves.toBeDefined();
  });

  it("lets a document keep its own value", async () => {
    const cms = make();
    const tag = await cms.create("tags", { slug: "a", rank: 1 });
    await expect(cms.update("tags", tag.id, { slug: "a", rank: 1 })).resolves.toMatchObject({
      slug: "a",
    });
  });

  it("rejects a used slug", async () => {
    const cms = defineCms({
      collections: {
        posts: {
          fields: { title: { type: "text" }, slug: { type: "slug", from: "title", unique: true } },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    await client.create("posts", { title: "A", slug: "a" });
    const error = await client.create("posts", { title: "B", slug: "a" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, body: { errors: { slug: "Already used" } } });
  });

  it("checks values set by beforeChange", async () => {
    const cms = make();
    await cms.create("tags", { slug: "a" });
    await expect(cms.create("tags", { name: "a" })).rejects.toMatchObject({
      errors: { slug: "Already used" },
    });
  });
});

describe("private", () => {
  const make = () =>
    defineCms({
      collections: {
        people: {
          fields: {
            name: { type: "text" },
            email: { type: "text", private: true },
            contact: { type: "group", private: true, fields: { phone: { type: "text" } } },
          },
        },
        posts: { fields: { author: { type: "relation", collection: "people" } } },
      },
      globals: {
        site: { fields: { name: { type: "text" }, key: { type: "text", private: true } } },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
  const person = { name: "A", email: "e", contact: { phone: "p" } };

  it("is missing on public reads and sent with a session", async () => {
    const cms = make();
    const { client } = setup(cms);
    const p = await cms.create("people", person);
    await cms.setGlobal("site", { name: "S", key: "k" });
    const reads = async () => [
      await client.findById("people", p.id),
      (await client.find("people"))[0],
      await client.findOne("people", { where: { name: "A" } }),
    ];
    for (const read of await reads())
      expect(read).toEqual({
        name: "A",
        id: p.id,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    expect(await client.getGlobal("site")).toEqual({ name: "S" });
    await client.signUp(admin);
    for (const read of await reads()) expect(read).toMatchObject(person);
    expect(await client.getGlobal("site")).toEqual({ name: "S", key: "k" });
  });

  it("cannot be filtered without a session", async () => {
    const { client, fetch } = setup(make());
    const get = (query: string) => fetch(`${origin}/api/cms/collections/people?${query}`);
    expect((await get("email=e")).status).toBe(400);
    await client.signUp(admin);
    expect((await get("email=e")).status).toBe(200);
  });

  it("is left out of a select without a session and returned with one", async () => {
    const cms = make();
    const { client, fetch } = setup(cms);
    const p = await cms.create("people", person);
    const get = async () =>
      (
        await fetch(`${origin}/api/cms/collections/people/${p.id}?select=name,email,contact.phone`)
      ).json();
    expect(await get()).toEqual({ id: p.id, name: "A" });
    await client.signUp(admin);
    expect(await get()).toEqual({ id: p.id, name: "A", email: "e", contact: { phone: "p" } });
  });

  it("is missing in populated documents on public reads", async () => {
    const cms = make();
    const { client } = setup(cms);
    const p = await cms.create("people", person);
    const post = await cms.create("posts", { author: p.id });
    expect((await client.findById("posts", post.id)).author).toEqual({
      name: "A",
      id: p.id,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });
});

describe("page preset", () => {
  // A test sets it to fail the update of the page with that slug.
  let failSlug: string | undefined;
  const make = () =>
    defineCms({
      collections: {
        pages: {
          titleField: "title",
          fields: { ...page.fields, ...seo.fields, body: { type: "textarea" } },
          hooks: {
            afterChange: page.hooks.afterChange,
            beforeChange: {
              ...page.hooks.beforeChange,
              fail: ({ originalDoc }) => {
                if (originalDoc && originalDoc.slug === failSlug) throw new Error("boom");
              },
            },
          },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
  let cms: ReturnType<typeof make>;
  let client: ReturnType<typeof setup<ReturnType<typeof make>>>["client"];
  let fetch: ReturnType<typeof setup>["fetch"];
  beforeEach(async () => {
    failSlug = undefined;
    ({ cms, client, fetch } = setup(make()));
    await client.signUp(admin);
  });
  const stored = async (id: string) => (await cms.findById("pages", id, { populate: false }))?.path;
  // Status and field keys of a 400 body.
  const fieldErrors = async (promise: Promise<unknown>) => {
    const e = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    return e instanceof CmsError ? [e.status, Object.keys(e.body?.errors ?? {})] : e;
  };
  const tree = async () => {
    const about = await client.create("pages", { title: "About", slug: "about" });
    const team = await client.create("pages", { title: "Team", slug: "team", parent: about.id });
    const berlin = await client.create("pages", {
      title: "Berlin",
      slug: "berlin",
      parent: team.id,
    });
    return { about, team, berlin };
  };

  it("stores nested paths", async () => {
    const { about, team, berlin } = await tree();
    expect([await stored(about.id), await stored(team.id), await stored(berlin.id)]).toEqual([
      "/about",
      "/about/team",
      "/about/team/berlin",
    ]);
  });

  it("stores / for index at root", async () => {
    const home = await client.create("pages", { title: "Home", slug: "index" });
    expect(await stored(home.id)).toBe("/");
  });

  it("fills an empty slug from the title", async () => {
    const p = await client.create("pages", { title: "Über uns", slug: "" });
    expect(p).toMatchObject({ slug: "uber-uns", path: "/uber-uns" });
  });

  it("rejects an invalid slug", async () => {
    expect(await fieldErrors(client.create("pages", { title: "A", slug: "Not Valid" }))).toEqual([
      400,
      ["slug"],
    ]);
  });

  it("overwrites path in input", async () => {
    const a = await client.create("pages", { title: "A", slug: "a", path: "/x" });
    expect(await stored(a.id)).toBe("/a");
    await cms.update("pages", a.id, { title: "A", slug: "a", path: "/y" });
    expect(await stored(a.id)).toBe("/a");
  });

  it("rejects a duplicate path", async () => {
    const { about } = await tree();
    expect(await fieldErrors(client.create("pages", { title: "About", slug: "about" }))).toEqual([
      400,
      ["slug"],
    ]);
    const contact = await client.create("pages", { title: "Contact", slug: "contact" });
    await expect(
      client.create("pages", { title: "Team", slug: "team", parent: contact.id }),
    ).resolves.toBeDefined();
    expect(
      await fieldErrors(client.update("pages", contact.id, { title: "Contact", slug: "about" })),
    ).toEqual([400, ["slug"]]);
    await expect(
      client.update("pages", about.id, { title: "About", slug: "about" }),
    ).resolves.toBeDefined();
  });

  it("rejects moving a page under its own descendant", async () => {
    const { about, berlin } = await tree();
    expect(
      await fieldErrors(
        client.update("pages", about.id, { title: "About", slug: "about", parent: berlin.id }),
      ),
    ).toEqual([400, ["parent"]]);
    expect(
      await fieldErrors(
        client.update("pages", about.id, { title: "About", slug: "about", parent: about.id }),
      ),
    ).toEqual([400, ["parent"]]);
    expect((await cms.findById("pages", about.id, { populate: false }))?.parent).toBeUndefined();
  });

  it("rewrites descendant paths on rename", async () => {
    const { about, team, berlin } = await tree();
    await client.update("pages", about.id, { title: "About", slug: "company" });
    expect([await stored(about.id), await stored(team.id), await stored(berlin.id)]).toEqual([
      "/company",
      "/company/team",
      "/company/team/berlin",
    ]);
  });

  it("rolls back a rename when a descendant update fails", async () => {
    const { about, team, berlin } = await tree();
    failSlug = "berlin";
    expect(
      await status(client.update("pages", about.id, { title: "About", slug: "company" })),
    ).toBe(500);
    expect([await stored(about.id), await stored(team.id), await stored(berlin.id)]).toEqual([
      "/about",
      "/about/team",
      "/about/team/berlin",
    ]);
  });

  it("refuses to delete a page with children", async () => {
    const { about, team, berlin } = await tree();
    const error = await client.delete("pages", about.id).catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 409,
      body: { references: [{ collection: "pages", id: team.id }] },
    });
    await client.delete("pages", berlin.id);
    expect(await cms.findById("pages", berlin.id)).toBeUndefined();
  });

  it("disables a hook omitted by name", async () => {
    const { uniquePath, ...beforeChange } = page.hooks.beforeChange;
    const cms = defineCms({
      collections: { pages: { fields: page.fields, hooks: { beforeChange } } },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    await cms.create("pages", { title: "About", slug: "about" });
    await expect(cms.create("pages", { title: "About", slug: "about" })).resolves.toMatchObject({
      path: "/about",
    });
  });

  it("stores seo as sent", async () => {
    const p = await client.create("pages", {
      title: "About",
      slug: "about",
      seo: { description: "D" },
    });
    expect((await cms.findById("pages", p.id))?.seo).toEqual({ description: "D" });
  });

  it("reads a page by path over HTTP", async () => {
    const { team } = await tree();
    const res = await fetch(`${origin}/api/cms/collections/pages?path=/about/team`);
    expect((await res.json()).map((p: { id: string }) => p.id)).toEqual([team.id]);
  });
});

describe("nestedPaths", () => {
  it("works with other field names", async () => {
    const cms = defineCms({
      collections: {
        categories: {
          fields: {
            name: { type: "text", required: true },
            handle: { type: "slug", from: "name", parent: "parentCategory", path: "url" },
            parentCategory: { type: "relation", collection: "categories", onDelete: "restrict" },
            url: { type: "text", readOnly: true },
          },
          hooks: nestedPaths({ slug: "handle", parent: "parentCategory", path: "url" }),
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    const shoes = await cms.create("categories", { name: "Shoes", handle: "" });
    const boots = await cms.create("categories", {
      name: "Boots",
      handle: "",
      parentCategory: shoes.id,
    });
    expect([shoes.url, boots.url]).toEqual(["/shoes", "/shoes/boots"]);
    await expect(cms.create("categories", { name: "Shoes", handle: "" })).rejects.toMatchObject({
      errors: { handle: expect.any(String) },
    });
    await expect(
      cms.update("categories", shoes.id, {
        name: "Shoes",
        handle: "shoes",
        parentCategory: boots.id,
      }),
    ).rejects.toMatchObject({
      errors: { parentCategory: expect.any(String) },
    });
    await cms.update("categories", shoes.id, { name: "Shoes", handle: "footwear" });
    expect((await cms.findById("categories", boots.id))?.url).toBe("/footwear/boots");
  });

  it("does not store values changed by read hooks when paths move", async () => {
    const cms = defineCms({
      collections: {
        pages: {
          fields: {
            ...page.fields,
            title: {
              type: "text",
              required: true,
              hooks: { afterRead: [({ value }) => `${value} *`] },
            },
          },
          hooks: page.hooks,
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    const about = await cms.create("pages", { title: "About", slug: "about" });
    const team = await cms.create("pages", { title: "Team", slug: "team", parent: about.id });
    await cms.update("pages", about.id, { slug: "company" });
    expect(await cms.findById("pages", team.id)).toMatchObject({
      title: "Team *",
      path: "/company/team",
    });
  });
});

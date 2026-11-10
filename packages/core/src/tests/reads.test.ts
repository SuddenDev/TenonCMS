import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import type { DocumentOf, GlobalOf } from "../client/index.ts";
import { defineCms } from "../index.ts";
import { libsqlDialect } from "../db/index.ts";
import { withDatabase } from "../cms/create-cms.ts";
import { durableObject } from "../integrations/cloudflare/index.ts";
import {
  admin,
  base,
  define,
  fresh,
  origin,
  setup,
  status,
  type Env,
  testDatabase,
} from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
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

  it("filter by null as the query value null, and ignore empty or undefined values", async () => {
    await cms.create("posts", { title: "D" });
    expect(
      (await client.find("posts", { where: { featured: null, views: null } })).map((p) => p.title),
    ).toEqual(["D"]);
    const res = await cms.fetch(new Request(`${origin}/_tenon/collections/posts?views=null`));
    expect((await res.json()).map((p: { title: string }) => p.title)).toEqual(["D"]);
    const empty = await cms.fetch(new Request(`${origin}/_tenon/collections/posts?views=&title=`));
    expect(await empty.json()).toHaveLength(4);
    expect(await client.find("posts", { where: { views: undefined } })).toHaveLength(4);
  });

  it("limit results", async () => {
    expect(await client.find("posts", { limit: 2 })).toHaveLength(2);
    expect(await client.findOne("posts", { where: { views: 2 } })).toMatchObject({ title: "C" });
  });

  it.each([
    "?nope=1",
    "?seo=x",
    "?limit=0",
    "?limit=-1",
    "?limit=abc",
    "?views=abc",
    "?featured=yes",
  ])("reject %s", async (query) => {
    expect(
      (await cms.fetch(new Request(`${origin}/_tenon/collections/posts${query}`))).status,
    ).toBe(400);
  });

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
      new Request(`${origin}/_tenon${path}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body,
      }),
    );

  it("answer every error with a message", async () => {
    const res = await cms.fetch(new Request(`${origin}/_tenon/schema`));
    expect([res.status, await res.json()]).toEqual([401, { message: "Unauthorized" }]);
    const filter = await cms.fetch(new Request(`${origin}/_tenon/collections/posts?nope=1`));
    expect([filter.status, await filter.json()]).toEqual([400, { message: "Invalid filter" }]);
    const missing = await cms.fetch(new Request(`${origin}/_tenon/collections/nope`));
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

  it("send nav and description in /schema", async () => {
    const nav = { display: "settings", group: "Blog", icon: "newspaper", order: 5 } as const;
    const inst = defineCms({
      collections: {
        posts: {
          description: "All posts",
          nav,
          fields: {
            title: {
              type: "text",
              description: { clientRef: "./posts.client.ts#titleDescription" },
            },
          },
        },
      },
      globals: { footer: { description: "Footer", nav, fields: { text: { type: "text" } } } },
      database: testDatabase(),
      secret: "x".repeat(32),
      media: false,
    });
    const s = setup(inst);
    await s.client.signUp(admin);
    const res = await s.fetch(`${origin}/_tenon/schema`);
    const body = await res.json();
    expect(body.collections.posts).toMatchObject({ description: "All posts", nav });
    expect(body.collections.posts.fields.title.description).toEqual({
      clientRef: "./posts.client.ts#titleDescription",
    });
    expect(body.globals.footer).toMatchObject({ description: "Footer", nav });
  });

  it("reject invalid sign-up data", async () => {
    expect(await status(client.signUp({ ...admin, email: "not-an-email" }))).toBe(400);
    expect(await status(client.signUp({ ...admin, password: "short" }))).toBe(400);
    expect((await post("/auth/sign-up/email", "{")).status).toBe(400);
  });

  it("reject a forged session cookie", async () => {
    const res = await cms.fetch(
      new Request(`${origin}/_tenon/schema`, {
        headers: { origin, cookie: "better-auth.session_token=forged.value" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("reject writes to unknown names or documents with 404, and invalid data with 400", async () => {
    await client.signUp(admin);
    expect(await status(client.create("pages" as never, { title: "Hi" } as never))).toBe(404);
    expect(await status(client.setGlobal("nope" as never, {} as never))).toBe(404);
    expect(await status(client.update("posts", "missing", { title: "Hi" }))).toBe(404);
    expect(await status(client.setGlobal("site", { name: 1 } as never))).toBe(400);
    const { id } = await client.create("posts", { title: "Hi" });
    expect(await status(client.update("posts", id, { title: "" }))).toBe(400);
    expect(await client.findById("posts", id)).toMatchObject({ title: "Hi" });
  });

  it("reject an unknown collection in every method", async () => {
    const { id } = await cms.create("posts", { title: "Hi" });
    const unknown = /Unknown collection "other"/;
    await expect(cms.findById("other" as never, id)).rejects.toThrow(unknown);
    await expect(cms.update("other" as never, id, {})).rejects.toThrow(unknown);
    await expect(cms.delete("other" as never, id)).rejects.toThrow(unknown);
    expect(await cms.findById("posts", id)).toBeDefined();
  });

  it("keep reads working with a short secret, but fail auth", async () => {
    const bad = define("short");
    expect((await bad.fetch(new Request(`${origin}/_tenon/collections/posts`))).status).toBe(200);
    const cookie = { headers: { cookie: "better-auth.session_token=x" } };
    expect(
      (await bad.fetch(new Request(`${origin}/_tenon/collections/posts`, cookie))).status,
    ).toBe(200);
    await expect(bad.auth()).rejects.toThrow(/at least 32 characters/);
    const signIn = new Request(`${origin}/_tenon/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(admin),
    });
    expect((await bad.fetch(signIn)).status).toBe(500);
    // Without a session, no lookup runs.
    expect((await bad.fetch(new Request(`${origin}/_tenon/schema`))).status).toBe(401);
  });

  it("reject unknown options at the type level", () => {
    // @ts-expect-error `globalz` is not an option
    defineCms({ collections: {}, globalz: {}, database: testDatabase(), secret: "" });
  });
});

describe("database", () => {
  it("runs on a host-given Kysely dialect", async () => {
    const cms = defineCms({
      ...base,
      database: { dialect: libsqlDialect({ url: ":memory:" }) },
    });
    await cms.create("posts", { title: "A" });
    expect((await cms.find("posts")).map((p) => p.title)).toEqual(["A"]);
  });

  it("gives each copy of an instance its own database", async () => {
    const memory = () => ({ dialect: libsqlDialect({ url: ":memory:" }) });
    const cms = defineCms({ ...base, database: durableObject() });
    const a = withDatabase(cms, memory());
    const b = withDatabase(cms, memory());
    await a.create("posts", { title: "A" });
    expect((await a.find("posts")).map((p) => p.title)).toEqual(["A"]);
    expect(await b.find("posts")).toEqual([]);
    await expect(cms.find("posts")).rejects.toThrow("runs inside its Durable Object");
  });

  it("connects again after a failed connect", async () => {
    const dialect = libsqlDialect({ url: ":memory:" });
    let failures = 1;
    const createDriver = dialect.createDriver.bind(dialect);
    dialect.createDriver = () => {
      if (failures-- > 0) throw new Error("connect failed");
      return createDriver();
    };
    const cms = defineCms({ ...base, database: { dialect } });
    await expect(cms.find("posts")).rejects.toThrow("connect failed");
    expect(await cms.find("posts")).toEqual([]);
  });
});

it("DocumentOf and GlobalOf type a read like the client returns it", async () => {
  await cms.create("posts", { title: "A" });
  const options = { where: { title: "A" }, select: { title: true } } as const;
  const post = await client.findOne("posts", options);
  expectTypeOf(post!).toEqualTypeOf<DocumentOf<"posts", typeof options, Env["cms"]>>();
  expectTypeOf(post!).not.toEqualTypeOf<DocumentOf<"posts", {}, Env["cms"]>>();
  const general = await client.getGlobal("general");
  expectTypeOf(general).toEqualTypeOf<GlobalOf<"general", {}, Env["cms"]>>();
  expect(post).toMatchObject({ title: "A" });
});

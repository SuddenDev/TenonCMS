import { beforeEach, describe, expect, it } from "vitest";
import { defineCms, definePlugin, ValidationError } from "../index.ts";
import { admin, base, fresh, origin, setup, status, type Env } from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
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
    expect(Object.keys(cms.schema.collections!)).toEqual(["posts", "logs", "media"]);
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

  it("run publicMiddleware on every request and middleware behind the session", async () => {
    const seen: string[] = [];
    const guard = definePlugin({
      name: "guard",
      publicMiddleware: async (c, next) => {
        if (c.req.header("x-block")) return c.json({ message: "Blocked" }, 429);
        seen.push(`public ${c.req.method} ${new URL(c.req.url).pathname}`);
        await c.var.cms.find("posts");
        await next();
        c.header("x-guard", "1");
      },
      middleware: async (c, next) => {
        seen.push(`session ${c.var.user.email}`);
        await next();
      },
    });
    const { client, fetch } = setup(defineCms({ ...base, plugins: [guard] }));
    const get = (init?: RequestInit) => fetch(`${origin}/api/cms/collections/posts`, init);

    const res = await get();
    expect(res.headers.get("x-guard")).toBe("1");
    expect((await get({ headers: { "x-block": "1" } })).status).toBe(429);
    expect(seen).toEqual(["public GET /api/cms/collections/posts"]);

    // Unauthorized writes stop at the session check, before `middleware`.
    expect(await status(client.create("posts", { title: "a" }))).toBe(401);
    await client.signUp(admin);
    await client.create("posts", { title: "a" });
    expect(seen.slice(1)).toEqual([
      "public POST /api/cms/collections/posts",
      "public POST /api/cms/auth/sign-up/email",
      "public POST /api/cms/collections/posts",
      `session ${admin.email}`,
    ]);
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

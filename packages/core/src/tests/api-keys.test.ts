import { describe, expect, it } from "vitest";
import { createClient } from "../client/index.ts";
import {
  defineCms,
  definePlugin,
  type AccessArgs,
  type ApiKeyPermissions,
  type NewApiKey,
  type Schema,
} from "../index.ts";
import { admin, base, origin, post, setup, status, withAdmin, withMedia } from "./setup.ts";
import { png } from "./fixtures.ts";

const editor = { name: "Ed", email: "e@b.co", password: "password123" };

const stats = definePlugin({
  name: "stats",
  routes: (api) => api.get("/me", (c) => c.json({ email: c.var.user.email })),
});

const schema = {
  ...base,
  plugins: [stats],
  collections: {
    ...base.collections,
    notes: {
      fields: {
        title: { type: "text" },
        secret: { type: "text", private: true },
        staff: { type: "text", access: { read: ["admin"] } },
      },
      access: {
        read: ["admin"],
        delete: false,
        update: ({ apiKey }: AccessArgs) => apiKey?.name !== "Narrow",
      },
    },
  },
} as const;

/** An instance with a signed-in admin and a signed-in editor, each with a client. */
async function users() {
  const env = await withAdmin(defineCms(schema));
  await env.create(editor);
  const ed = setup(env.cms);
  await ed.client.signIn(editor);
  return { ...env, editor: ed };
}

/** A server-side client with an API key: no cookies, no `Origin`. `fetch` also sends the key. */
function keyed<C extends { schema: Schema; fetch(request: Request): Promise<Response> }>(
  cms: C,
  apiKey: string,
) {
  const send = (input: RequestInfo | URL, init?: RequestInit) =>
    cms.fetch(new Request(input, init));
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("x-api-key", apiKey);
    return send(input, { ...init, headers });
  };
  return { fetch, client: createClient<C>({ baseUrl: origin, apiKey, fetch: send }) };
}

type Creator = {
  apiKeys: {
    create(data: {
      name: string;
      permissions: ApiKeyPermissions;
    }): Promise<{ id: string; key: string }>;
  };
};

/** Creates a key as the admin and returns its id and its clients. */
async function keyFor<C extends { schema: Schema; fetch(request: Request): Promise<Response> }>(
  u: { cms: C; client: Creator },
  permissions: ApiKeyPermissions,
  name = "Key",
) {
  const created = await u.client.apiKeys.create({ name, permissions });
  return { id: created.id, ...keyed(u.cms, created.key) };
}

describe("API key callers", () => {
  it("read published documents only, even with the preview cookie", async () => {
    const u = await users();
    await u.client.createDraft("posts", { title: "Draft" });
    const live = await u.client.create("posts", { title: "Live" });
    const { key } = await u.client.apiKeys.create({
      name: "Build",
      permissions: { "collection:posts": ["read"] },
    });
    const res = await u.cms.fetch(
      new Request(`${origin}/_tenon/collections/posts`, {
        headers: { "x-api-key": key, cookie: "tenon-preview=drafts" },
      }),
    );
    expect(((await res.json()) as { id: string }[]).map((p) => p.id)).toEqual([live.id]);
  });

  it("answer 401 for an unknown, revoked or deleted key", async () => {
    const u = await users();
    expect(await status(keyed(u.cms, "nope".repeat(20)).client.find("posts"))).toBe(401);

    const k = await keyFor(u, { "collection:posts": ["read"] }, "Old");
    expect(await k.client.find("posts")).toEqual([]);
    await u.client.apiKeys.revoke(k.id);
    expect(await status(k.client.find("posts"))).toBe(401);
    expect(await u.client.apiKeys.list()).toEqual([
      expect.objectContaining({ id: k.id, name: "Old", enabled: false }),
    ]);

    await u.client.apiKeys.delete(k.id);
    expect(await u.client.apiKeys.list()).toEqual([]);
    expect(await status(k.client.find("posts"))).toBe(401);
  });

  it("are refused by withSession() for a bad key", async () => {
    const u = await users();
    const request = new Request(origin, { headers: { "x-api-key": "nope".repeat(20) } });
    await expect(u.cms.withSession(request)).rejects.toMatchObject({ status: 401 });
  });
});

describe("API key grid", () => {
  it("allows and denies each operation on a collection", async () => {
    const u = await users();
    const p = await u.client.create("posts", { title: "A" });
    const none = await keyFor(u, {});
    expect(await status(none.client.find("posts"))).toBe(403);

    const k = await keyFor(u, { "collection:posts": ["read", "create"] });
    expect(await k.client.find("posts")).toHaveLength(1);
    expect((await k.client.create("posts", { title: "B" })).title).toBe("B");
    expect(await status(k.client.update("posts", p.id, { title: "C" }))).toBe(403);
    expect(await status(k.client.delete("posts", p.id))).toBe(403);

    const all = await keyFor(u, { "collection:posts": ["update", "delete"] });
    expect((await all.client.update("posts", p.id, { title: "C" })).title).toBe("C");
    await all.client.delete("posts", p.id);
  });

  it("allows and denies each operation on a global", async () => {
    const u = await users();
    const read = await keyFor(u, { "global:site": ["read"] });
    expect(await read.client.getGlobal("site")).toMatchObject({});
    expect(await status(read.client.setGlobal("site", { name: "X" }))).toBe(403);
    expect(await status(keyFor(u, {}).then((k) => k.client.getGlobal("site")))).toBe(403);

    const write = await keyFor(u, { "global:site": ["update"] });
    expect((await write.client.setGlobal("site", { name: "X" })).name).toBe("X");
  });

  it("applies over withSession() too", async () => {
    const u = await users();
    const { key } = await u.client.apiKeys.create({
      name: "Read",
      permissions: { "collection:posts": ["read"] },
    });
    const cms = await u.cms.withSession(new Request(origin, { headers: { "x-api-key": key } }));
    expect(await cms.find("posts")).toEqual([]);
    await expect(cms.create("posts", { title: "C" })).rejects.toMatchObject({ status: 403 });
  });

  it("replaces a role list, keeps `false`, and lets a function rule see the key", async () => {
    const u = await users();
    const n = await u.client.create("notes", { title: "A" });
    const k = await keyFor(u, { "collection:notes": ["read", "update", "delete"] });
    expect((await k.client.find("notes")).map((d) => d.id)).toEqual([n.id]);
    expect((await k.client.update("notes", n.id, { title: "B" })).title).toBe("B");
    expect(await status(k.client.delete("notes", n.id))).toBe(403);

    const narrow = await keyFor(u, { "collection:notes": ["update"] }, "Narrow");
    expect(await status(narrow.client.update("notes", n.id, { title: "C" }))).toBe(403);
  });

  it("hides role-only and private fields from a key", async () => {
    const u = await users();
    await u.client.create("notes", { title: "A", secret: "s", staff: "t" });
    const k = await keyFor(u, { "collection:notes": ["read"] });
    const [note] = await k.client.find("notes");
    expect(note.title).toBe("A");
    expect(note).not.toHaveProperty("secret");
    expect(note).not.toHaveProperty("staff");
  });

  it("records the key as the author", async () => {
    const u = await users();
    const k = await keyFor(u, { "collection:posts": ["read", "create", "update"] });
    const p = await k.client.create("posts", { title: "B" });
    expect(p.createdBy).toBe(`key:${k.id}`);
    expect(p.updatedBy).toBe(`key:${k.id}`);
    await u.client.create("posts", { title: "Mine" });
    const found = await k.client.find("posts", { where: { createdBy: `key:${k.id}` } });
    expect(found.map((d) => d.id)).toEqual([p.id]);
  });

  it("uploads media with `create` on media", async () => {
    const m = withMedia();
    await m.client.signUp(admin);
    const k = await keyFor(m, { "collection:media": ["read", "create"] });
    const doc = await k.client.media.upload(new Blob([png], { type: "image/png" }), {
      filename: "a.png",
    });
    expect(doc.filename).toBe("a.png");
    expect(doc.createdBy).toBe(`key:${k.id}`);

    const read = await keyFor(m, { "collection:media": ["read"] });
    const upload = read.client.media.upload(new Blob([png], { type: "image/png" }), {
      filename: "b.png",
    });
    expect(await status(upload)).toBe(403);
  });

  it("denies parts and abort of an upload without `create` on media", async () => {
    const m = withMedia();
    await m.client.signUp(admin);
    const plan = (await (
      await post(m.fetch, "/media/uploads", {
        filename: "a.png",
        mimeType: "image/png",
        size: png.byteLength,
      })
    ).json()) as { id: string; parts: { url: string }[] };
    const k = await keyFor(m, { "collection:media": ["read"] });
    const put = await k.fetch(`${origin}${plan.parts[0].url}`, { method: "PUT", body: png });
    expect(put.status).toBe(403);
    const abort = await k.fetch(`${origin}/_tenon/media/uploads/${plan.id}`, { method: "DELETE" });
    expect(abort.status).toBe(403);
  });

  it("reaches /schema only with `read` on schema, which shows the grid", async () => {
    const u = await users();
    const none = await keyFor(u, { "collection:posts": ["read"] });
    expect(await status(none.client.getSchema())).toBe(403);

    const k = await keyFor(u, { schema: ["read"], "collection:posts": ["read", "create"] });
    const json = (await k.client.getSchema()) as any;
    expect(json.collections.posts.access).toEqual({
      read: true,
      create: true,
      update: false,
      delete: false,
    });
    expect(json.globals.site.access).toEqual({ read: false, update: false });
    expect(json.collections.notes.fields.secret.access).toEqual({ read: false });
  });

  it("never reaches plugin routes, previews, invites, the password or key management", async () => {
    const u = await users();
    const all: ApiKeyPermissions = {
      schema: ["read"],
      "collection:posts": ["create", "read", "update", "delete"],
    };
    const k = await keyFor(u, all);
    expect((await k.fetch(`${origin}/_tenon/stats/me`)).status).toBe(403);
    expect(await status(k.client.preview.enter())).toBe(403);
    expect(await status(k.client.invites.list())).toBe(403);
    expect(await status(k.client.apiKeys.list())).toBe(403);
    const res = await post(k.fetch, "/account/password", { newPassword: "password456" });
    expect(res.status).toBe(403);
  });
});

describe("API key management", () => {
  it("is refused over better-auth's own endpoints", async () => {
    const u = await users();
    expect((await post(u.editor.fetch, "/auth/api-key/create", { name: "x" })).status).toBe(403);
    expect((await post(u.fetch, "/auth/api-key/create", { name: "x" })).status).toBe(403);
  });

  it("is for admins only", async () => {
    const u = await users();
    const k = await keyFor(u, {});
    const c = u.editor.client.apiKeys;
    expect(await status(c.list())).toBe(403);
    expect(await status(c.create({ name: "x", permissions: {} }))).toBe(403);
    expect(await status(c.revoke(k.id))).toBe(403);
    expect(await status(c.delete(k.id))).toBe(403);
  });

  it("lists every key with its creator and grid, never the secret", async () => {
    const u = await users();
    const permissions = { "collection:posts": ["read"], schema: ["read"] } as ApiKeyPermissions;
    const created = await u.client.apiKeys.create({ name: "Build", permissions });
    expect(created.key).toEqual(expect.any(String));
    const [listed] = await u.client.apiKeys.list();
    expect(listed).toMatchObject({
      id: created.id,
      name: "Build",
      permissions,
      enabled: true,
      creator: { id: u.me.id, name: admin.name, email: admin.email },
      lastUsedAt: null,
    });
    expect(listed).not.toHaveProperty("key");
  });

  it("rejects unknown targets and operations", async () => {
    const u = await users();
    for (const permissions of [
      { "collection:nope": ["read"] },
      { "global:site": ["delete"] },
      { schema: ["update"] },
      { users: ["read"] },
    ])
      expect((await post(u.fetch, "/api-keys", { name: "x", permissions })).status).toBe(400);
  });

  it("rolls a key: a new secret for the same key, the old one stops at once", async () => {
    const u = await users();
    const old = await keyFor(u, { "collection:posts": ["read", "create"] }, "Sync");
    const before = (await u.client.apiKeys.list())[0];

    const res = await post(u.fetch, `/api-keys/${old.id}/roll`, {});
    expect(res.headers.get("cache-control")).toBe("no-store");
    const rolled = (await res.json()) as NewApiKey;
    expect(rolled).toMatchObject({ id: old.id, name: "Sync", permissions: before.permissions });
    expect(rolled.key).toEqual(expect.any(String));
    expect(rolled.start).not.toBe(before.start);
    expect(rolled.key.startsWith(rolled.start!)).toBe(true);

    expect(await status(old.client.find("posts"))).toBe(401);
    const k = keyed(u.cms, rolled.key);
    expect((await k.client.create("posts", { title: "A" })).createdBy).toBe(`key:${old.id}`);
  });

  it("does not roll a revoked or unknown key", async () => {
    const u = await users();
    const k = await keyFor(u, {});
    await u.client.apiKeys.revoke(k.id);
    expect(await status(u.client.apiKeys.roll(k.id))).toBe(404);
    expect(await status(u.client.apiKeys.roll("nope"))).toBe(404);
    expect(await status(u.editor.client.apiKeys.roll(k.id))).toBe(403);
  });

  it("sets the expiry", async () => {
    const u = await users();
    const k = await u.client.apiKeys.create({ name: "x", permissions: {}, expiresIn: 86_400 });
    expect(Date.parse(k.expiresAt!) - Date.now()).toBeGreaterThan(86_000_000);
  });
});

import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../errors.ts";
import { defineCms, definePlugin } from "../index.ts";
import { clientRef } from "../admin/config.ts";
import { admin, base, origin, setup } from "./setup.ts";

const schema = {
  collections: {
    posts: {
      fields: {
        title: { type: "text" },
        color: { type: "custom:color" },
        seo: {
          type: "group",
          fields: { accent: { type: "custom:color" }, note: { type: "text" } },
        },
      },
    },
  },
  globals: { site: { fields: { theme: { type: "custom:color" }, name: { type: "text" } } } },
} as const;
const mount = clientRef("./m");

// An instance with `adminOptions`, a signed-in client and a POST helper for `/admin/load`.
async function boot(adminOptions: object, extra: object = {}) {
  const cms = defineCms({ ...base, ...schema, admin: adminOptions, ...extra } as never) as any;
  const s = setup(cms);
  await s.client.signUp(admin);
  const post = (body: unknown, fetch = s.fetch) =>
    fetch(`${origin}/api/cms/admin/load`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { ...s, cms, post };
}
const field = (over: object = {}) => ({
  kind: "field",
  type: "color",
  path: "color",
  owner: { collection: "posts" },
  ...over,
});
const page = (over: object = {}) => ({
  kind: "page",
  key: "stats",
  params: {},
  query: {},
  ...over,
});
const item = (over: object = {}) => ({ kind: "bar-item", id: "x", url: "/page", ...over });

describe("admin loaders: setup", () => {
  it("reserves the plugin name admin", () => {
    expect(() => defineCms({ ...base, plugins: [definePlugin({ name: "admin" })] })).toThrow(
      /"admin" is reserved for admin extension routes/,
    );
  });

  it("answers 401 without a session and runs no loader", async () => {
    const load = vi.fn(() => ({}));
    const { cms } = await boot({ pages: { stats: { mount, load } } });
    const { fetch } = setup(cms);
    const res = await fetch(`${origin}/api/cms/admin/load`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(page()),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(load).not.toHaveBeenCalled();
  });

  it("sets no-store on every kind of answer", async () => {
    const { post } = await boot({ pages: { stats: { mount, load: () => 1 } } });
    for (const body of [page(), page({ key: "nope" }), "{", { kind: "x" }])
      expect((await post(body)).headers.get("cache-control")).toBe("no-store");
  });
});

describe("admin loaders: request validation", () => {
  it("answers 400 for a malformed body and runs no loader", async () => {
    const load = vi.fn(() => ({}));
    const { post } = await boot({
      fields: { color: { mount, load } },
      pages: { stats: { mount, load } },
      adminBar: { items: { x: { label: "X", href: "/x", load } } },
    });
    const bad = [
      "{",
      "null",
      {},
      { kind: "other" },
      field({ type: 1 }),
      field({ path: "" }),
      field({ owner: {} }),
      field({ owner: { collection: "posts", global: "site" } }),
      field({ owner: { collection: "posts", id: 1 } }),
      page({ params: { a: 1 } }),
      page({ params: [] }),
      page({ query: { a: 1 } }),
      page({ query: { a: [1] } }),
      page({ key: undefined }),
      item({ url: 1 }),
      item({ url: "//evil.test/x" }),
      item({ url: "javascript:alert(1)" }),
      item({ url: "/a\nb" }),
      item({ id: "" }),
    ];
    for (const body of bad) expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    expect(load).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown registration or one without a loader", async () => {
    const load = vi.fn(() => ({}));
    const { post } = await boot({
      fields: { plain: { mount }, color: { mount, load } },
      pages: { plain: { mount }, stats: { mount, load } },
      adminBar: {
        items: {
          plain: { label: "P", href: "/p" },
          gone: false,
        },
      },
    });
    const missing = [
      field({ type: "nope" }),
      field({ type: "plain", path: "color" }),
      page({ key: "nope" }),
      page({ key: "plain" }),
      item({ id: "nope" }),
      item({ id: "plain" }),
      item({ id: "gone" }),
      // plain-object keys never match a registration
      field({ type: "__proto__" }),
      page({ key: "constructor" }),
      page({ key: "toString" }),
      item({ id: "hasOwnProperty" }),
    ];
    for (const body of missing) expect((await post(body)).status, JSON.stringify(body)).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });

  it("answers 404 for every bar request when the bar is off", async () => {
    const { post } = await boot({ adminBar: false });
    expect((await post(item())).status).toBe(404);
  });
});

describe("field loaders", () => {
  const color = (load: (ctx: any) => unknown) => ({ fields: { color: { mount, load } } });

  it("passes the schema field, path and owner for a new document", async () => {
    const load = vi.fn(() => ({ palette: ["red"] }));
    const { post } = await boot(color(load));
    const res = await post(field({ path: "seo.accent" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { palette: ["red"] } });
    expect(load).toHaveBeenCalledOnce();
    const ctx = (load.mock.calls[0] as any)[0];
    expect(ctx.field).toBe((schema.collections.posts.fields.seo.fields as any).accent);
    expect(ctx).toMatchObject({
      path: "seo.accent",
      owner: { collection: "posts" },
      user: { email: admin.email },
    });
    expect(typeof ctx.cms.find).toBe("function");
  });

  it("accepts an existing document and a global", async () => {
    const load = vi.fn(() => "ok");
    const { post, cms } = await boot(color(load));
    const doc = await cms.create("posts", { title: "T" });
    expect(
      await (await post(field({ owner: { collection: "posts", id: doc.id } }))).json(),
    ).toEqual({ data: "ok" });
    expect((load.mock.calls[0] as any)[0].owner).toEqual({ collection: "posts", id: doc.id });
    const res = await post(field({ path: "theme", owner: { global: "site" } }));
    expect(await res.json()).toEqual({ data: "ok" });
    expect((load.mock.calls[1] as any)[0].owner).toEqual({ global: "site" });
  });

  it("answers 404 for an unknown collection, global or document", async () => {
    const load = vi.fn(() => 1);
    const { post } = await boot(color(load));
    for (const owner of [
      { collection: "nope" },
      { collection: "__proto__" },
      { collection: "posts", id: "missing" },
      { global: "nope" },
      { global: "constructor" },
    ])
      expect((await post(field({ owner }))).status, JSON.stringify(owner)).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });

  it("answers 400 when the path is not a stored field of that custom type", async () => {
    const load = vi.fn(() => 1);
    const { post } = await boot(color(load));
    for (const [path, owner] of [
      ["title", { collection: "posts" }],
      ["missing", { collection: "posts" }],
      ["seo", { collection: "posts" }],
      ["seo.note", { collection: "posts" }],
      ["seo.accent.deeper", { collection: "posts" }],
      ["__proto__", { collection: "posts" }],
      ["color", { global: "site" }],
      ["name", { global: "site" }],
    ] as const)
      expect((await post(field({ path, owner }))).status, `${path}`).toBe(400);
    expect(load).not.toHaveBeenCalled();
  });

  it("answers 400 when the registered type differs from the field type", async () => {
    const load = vi.fn(() => 1);
    const { post } = await boot({ fields: { other: { mount, load } } });
    expect((await post(field({ type: "other" }))).status).toBe(400);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("page loaders", () => {
  it("passes params and query", async () => {
    const load = vi.fn(() => ({ ok: true }));
    const { post } = await boot({ pages: { stats: { mount, load } } });
    const params = { id: "7", rest: ["a", "b"] };
    const query = { tab: "x", flag: null, many: ["a", null] };
    const res = await post(page({ params, query }));
    expect(await res.json()).toEqual({ data: { ok: true } });
    const ctx = (load.mock.calls[0] as any)[0];
    expect(ctx.params).toEqual(params);
    expect(ctx.query).toEqual(query);
    expect(ctx.user.email).toBe(admin.email);
  });

  it("does not let prototype-like keys reach prototypes", async () => {
    const load = vi.fn(() => 1);
    const { post } = await boot({ pages: { stats: { mount, load } } });
    const res = await post(
      '{"kind":"page","key":"stats","params":{"__proto__":["x"],"constructor":"c","polluted":"1"},"query":{"__proto__":"y","prototype":null}}',
    );
    expect(res.status).toBe(200);
    const ctx = (load.mock.calls[0] as any)[0];
    expect(Object.getPrototypeOf(ctx.params)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(ctx.query)).toBe(Object.prototype);
    expect(ctx.params.constructor).toBe("c");
    expect(ctx.params.polluted).toBe("1");
    expect(ctx.query.prototype).toBeNull();
    expect(({} as any).x).toBeUndefined();
    expect(({} as any).y).toBeUndefined();
    expect(Object.keys(ctx.params)).not.toContain("__proto__");
  });
});

describe("bar item loaders", () => {
  it("runs only the selected item and answers { item }", async () => {
    const a = vi.fn(() => ({ label: "A2" }));
    const b = vi.fn(() => ({ label: "B2" }));
    const { post } = await boot({
      adminBar: {
        items: { a: { label: "A", href: "/a", load: a }, b: { label: "B", href: "/b", load: b } },
      },
    });
    const res = await post(item({ id: "a", url: "https://site.test/p?x=1" }));
    expect(await res.json()).toEqual({ item: { id: "a", label: "A2", href: "/a" } });
    expect(a).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://site.test/p?x=1", user: expect.anything() }),
    );
    expect(b).not.toHaveBeenCalled();
  });

  it("reloads a dropdown with its registered children, and a child alone", async () => {
    const parent = vi.fn(() => ({ icon: "bell" }));
    const one = vi.fn(() => ({ label: "Uno" }));
    const two = vi.fn(() => ({ n: 2 }));
    const { post } = await boot({
      adminBar: {
        items: {
          menu: {
            label: "Menu",
            load: parent,
            children: {
              one: { label: "One", href: "/1", load: one },
              two: { label: "Two", onClick: clientRef("./t"), load: two },
            },
          },
        },
      },
    });
    const full = await (await post(item({ id: "menu" }))).json();
    expect(full.item).toMatchObject({
      id: "menu",
      icon: "bell",
      children: [
        { id: "one", label: "Uno" },
        { id: "two", data: { n: 2 } },
      ],
    });
    parent.mockClear();
    one.mockClear();
    two.mockClear();
    const child = await (await post(item({ id: "two" }))).json();
    expect(child.item).toMatchObject({ id: "two", data: { n: 2 } });
    expect(two).toHaveBeenCalledOnce();
    expect(parent).not.toHaveBeenCalled();
    expect(one).not.toHaveBeenCalled();
  });

  it("applies only label, icon, href and children of a native item, and null hides it", async () => {
    let result: unknown = { label: "X2", href: "/x2", children: { k: { label: "K" } } };
    const { post } = await boot({
      adminBar: { items: { x: { label: "X", order: 4, href: "/x", load: () => result } } },
    });
    expect((await (await post(item())).json()).item).toEqual({
      id: "x",
      order: 4,
      label: "X2",
      href: "/x2",
      children: [{ id: "k", label: "K" }],
    });
    result = null;
    expect(await (await post(item())).json()).toEqual({ item: null });
    for (const bad of [{ id: "y" }, { order: 1 }, { onClick: 1 }, { label: 1 }, "text", []]) {
      result = bad;
      expect((await post(item())).status, JSON.stringify(bad)).toBe(500);
    }
  });

  it("gives click and mount items their result as data, null included", async () => {
    let result: unknown = { n: 1 };
    const { post } = await boot({
      adminBar: {
        items: {
          c: { label: "C", onClick: clientRef("./c"), load: () => result },
          m: { label: "M", mount: clientRef("./m"), load: () => result },
        },
      },
    });
    expect((await (await post(item({ id: "c" }))).json()).item).toMatchObject({ data: { n: 1 } });
    result = null;
    for (const id of ["c", "m"])
      expect((await (await post(item({ id }))).json()).item).toMatchObject({ id, data: null });
  });
});

describe("loader results and errors", () => {
  const results: [string, unknown][] = [
    ["a function", () => 1],
    ["a bigint", 1n],
    ["NaN", Number.NaN],
    ["a Date", new Date()],
    ["a Map", new Map()],
    ["a class instance", new (class A {})()],
    ["undefined", undefined],
    ["a cycle", (() => ((c: any) => ((c.c = c), c))({}))()],
  ];

  it("answers 500 and logs the source for a result that is not JSON", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      let result: unknown;
      const { post } = await boot({
        fields: { color: { mount, load: () => result } },
        pages: { stats: { mount, load: () => result } },
      });
      for (const [name, value] of results) {
        result = value;
        for (const body of [page(), field()]) {
          const res = await post(body);
          expect(res.status, name).toBe(500);
          expect(await res.json()).toEqual({ message: "Internal Server Error" });
        }
      }
      const logged = write.mock.calls.map((c) => String(c[0])).join("");
      expect(logged).toContain("admin page");
      expect(logged).toContain("integral.config.ts");
    } finally {
      write.mockRestore();
    }
  });

  it("drops undefined properties of a result", async () => {
    const { post } = await boot({
      pages: { stats: { mount, load: () => ({ a: 1, b: undefined, c: [{ d: undefined }] }) } },
    });
    expect(await (await post(page())).json()).toEqual({ data: { a: 1, c: [{}] } });
  });

  it("hides the message of an unexpected error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = () => {
        throw new Error("secret detail");
      };
      const { post } = await boot({
        fields: { color: { mount, load: boom } },
        pages: { stats: { mount, load: boom } },
        adminBar: { items: { x: { label: "X", href: "/x", load: boom } } },
      });
      for (const body of [page(), field(), item()]) {
        const res = await post(body);
        expect(res.status).toBe(500);
        const text = await res.text();
        expect(text).not.toContain("secret detail");
        expect(JSON.parse(text)).toEqual({ message: "Internal Server Error" });
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("maps expected errors with the existing handler", async () => {
    const invalid = () => {
      throw new ValidationError({ q: "bad" });
    };
    const { post } = await boot({
      pages: { stats: { mount, load: invalid } },
      adminBar: { items: { x: { label: "X", href: "/x", load: invalid } } },
    });
    for (const body of [page(), item()]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ errors: { q: "bad" } });
    }
  });
});

describe("perspective and user", () => {
  // A published post whose pending draft changes the title.
  async function titled() {
    const load = vi.fn(
      async ({ cms }: any) => (await cms.find("posts", { populate: false }))[0].title,
    );
    const b = await boot({ pages: { stats: { mount, load } } });
    const doc = await b.cms.create("posts", { title: "Published" });
    await b.cms.update("posts", doc.id, { title: "Draft" }, { draft: true });
    return { ...b, doc };
  }

  it("reads published data without the preview cookie", async () => {
    const { post } = await titled();
    expect(await (await post(page())).json()).toEqual({ data: "Published" });
  });

  it("reads drafts with a session and the preview cookie", async () => {
    const { post, fetch } = await titled();
    await fetch(`${origin}/api/cms/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ perspective: "drafts" }),
    });
    expect(await (await post(page())).json()).toEqual({ data: "Draft" });
  });

  it("checks the owner document with the same perspective", async () => {
    const load = vi.fn(() => 1);
    const { cms, post, fetch } = await boot({ fields: { color: { mount, load } } });
    const draft = await cms.create("posts", { title: "Only draft" }, { draft: true });
    const body = field({ owner: { collection: "posts", id: draft.id } });
    expect((await post(body)).status).toBe(404);
    await fetch(`${origin}/api/cms/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ perspective: "drafts" }),
    });
    expect((await post(body)).status).toBe(200);
  });

  it("gives each request the user of its own session", async () => {
    const load = vi.fn(({ user }: any) => user.email);
    const a = await boot({ pages: { stats: { mount, load } } });
    const second = { name: "Two", email: "two@b.co", password: "password123" };
    await (await a.cms.auth()).api.signUpEmail({ body: second });
    const other = setup(a.cms);
    await other.client.signIn({ email: second.email, password: second.password });
    expect(await (await a.post(page())).json()).toEqual({ data: admin.email });
    expect(await (await a.post(page(), other.fetch)).json()).toEqual({ data: second.email });
    expect(await (await a.post(page())).json()).toEqual({ data: admin.email });
  });
});

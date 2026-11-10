import { describe, expect, it, vi } from "vitest";
import { clientRef } from "../admin/config.ts";
import { defineCms, definePlugin } from "../index.ts";
import { builtIns } from "../preview/runtime/admin-bar-items.ts";
import { admin, base, origin, setup } from "./setup.ts";

// Signs up on `cms` and returns a GET of the admin bar for a page URL.
async function signedIn(cms: ReturnType<typeof defineCms>) {
  const s = setup(cms);
  await s.client.signUp(admin);
  const get = (url = "/page", mode = "site", extra = "") =>
    s.fetch(
      `${origin}/_tenon/admin-bar?url=${encodeURIComponent(url)}&mode=${encodeURIComponent(mode)}${extra}`,
    );
  const items = async (url?: string) => (await (await get(url)).json()).items;
  const ids = async (url?: string) => (await items(url)).map((i: { id: string }) => i.id);
  return { ...s, get, items, ids };
}
const bar = (admin: object, extra: object = {}) =>
  defineCms({ ...base, admin, ...extra } as never) as ReturnType<typeof defineCms>;
const items = (list: object) => bar({ adminBar: { items: list } });
const mount = clientRef("./m");

describe("admin bar endpoint", () => {
  it("accepts all eight positions and rejects unsupported positions at startup", () => {
    for (const position of [
      "top-left",
      "top-center",
      "top-right",
      "center-left",
      "center-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ] as const)
      expect(() => defineCms({ ...base, admin: { adminBar: { position } } })).not.toThrow();
    expect(() => defineCms({ ...base, admin: { adminBar: { position: "top" as never } } })).toThrow(
      "adminBar.position",
    );
  });

  it("answers 401 without a session, with no-store", async () => {
    const { fetch } = setup();
    const res = await fetch(`${origin}/_tenon/admin-bar?url=/&mode=site`);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers the built-ins at bottom-center, with no-store", async () => {
    const { get } = await signedIn(defineCms(base));
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      position: "bottom-center",
      items: builtIns("site"),
      branding: {},
    });
  });

  it("answers the configured position and branding", async () => {
    const { get } = await signedIn(
      bar({ name: "Site", icon: "/i.svg", adminBar: { position: "top-right" } }),
    );
    expect(await (await get()).json()).toMatchObject({
      position: "top-right",
      branding: { name: "Site", icon: "/i.svg" },
    });
  });

  it("is not mounted with adminBar: false", async () => {
    const { get } = await signedIn(bar({ adminBar: false }));
    expect((await get()).status).toBe(404);
  });

  it("rejects a missing or bad url or mode with 400, no-store and no loader call", async () => {
    const load = vi.fn(() => null);
    const { get, fetch } = await signedIn(items({ x: { label: "X", href: "/x", load } }));
    for (const q of ["", "?url=/", "?mode=site"])
      expect((await fetch(`${origin}/_tenon/admin-bar${q}`)).status).toBe(400);
    for (const [url, mode] of [
      ["", "site"],
      ["//evil.test", "site"],
      ["javascript:alert(1)", "site"],
      ["/a\nb", "site"],
      ["/page", "other"],
      ["/page", ""],
    ]) {
      const res = await get(url, mode);
      expect(res.status, `${url} ${mode}`).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(load).not.toHaveBeenCalled();
  });
});

describe("admin bar items", () => {
  it("serves static native items with the built-ins, sorted by order", async () => {
    const { items: list } = await signedIn(
      items({
        docs: { label: "Docs", href: "/docs", order: 15 },
        menu: { label: "Menu", order: 25, children: { c: { label: "C", href: "/c" } } },
        last: { label: "Last", href: "/last" },
      }),
    );
    expect((await list()).map((i: { id: string }) => i.id)).toEqual([
      "dashboard",
      "docs",
      "edit",
      "menu",
      "perspective",
      "last",
    ]);
    expect((await list())[3]).toEqual({
      id: "menu",
      label: "Menu",
      order: 25,
      children: [{ id: "c", label: "C", href: "/c" }],
    });
  });

  it("resolves a native item with its loader, given the page url and admin language", async () => {
    const load = vi.fn(({ url }: { url: string }) => ({
      label: { en: "Report", de: "Bericht" },
      href: `https://a.test/?u=${encodeURIComponent(url)}`,
    }));
    const { get } = await signedIn(items({ r: { label: "R", href: "/r", load } }));
    const res = await get("/posts/1?x=2", "site", "&locale=de");
    const r = (await res.json()).items.find((i: { id: string }) => i.id === "r");
    expect(r).toEqual({
      id: "r",
      label: { en: "Report", de: "Bericht" },
      href: "https://a.test/?u=%2Fposts%2F1%3Fx%3D2",
    });
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/posts/1?x=2",
        locale: "de",
        user: expect.anything(),
        cms: expect.anything(),
      }),
    );
  });

  it("keeps the data of every item separate", async () => {
    const { items: list } = await signedIn(
      bar(
        {
          adminBar: {
            items: {
              h: { label: "H", mount, load: () => ({ from: "host" }) },
              n: { label: "N", mount },
            },
          },
        },
        {
          plugins: [
            definePlugin({
              name: "p",
              admin: {
                adminBar: {
                  items: { p: { label: "P", mount, load: () => ({ from: "plugin" }) } },
                },
              },
            }),
          ],
        },
      ),
    );
    const byId = Object.fromEntries((await list()).map((i: any) => [i.id, i]));
    expect(byId.h.data).toEqual({ from: "host" });
    expect(byId.p.data).toEqual({ from: "plugin" });
    expect(byId.n.data).toBeUndefined();
  });

  it("marks only the built-ins, and a replacement never carries the marker", async () => {
    const { items: list } = await signedIn(
      items({
        dashboard: { label: "Home", href: "/", builtIn: true },
        mine: { label: "Mine", href: "/m", builtIn: true },
      }),
    );
    const byId = Object.fromEntries((await list()).map((i: any) => [i.id, i]));
    expect(byId.dashboard).toEqual({ id: "dashboard", label: "Home", href: "/" });
    expect(byId.mine.builtIn).toBeUndefined();
    expect(byId.edit.builtIn).toBe(true);
    expect(byId.perspective.builtIn).toBe(true);
  });

  it("replaces a built-in before any loader runs, so the replaced loader never runs", async () => {
    const first = vi.fn(() => ({ label: "First" }));
    const plugin = definePlugin({
      name: "p",
      admin: { adminBar: { items: { edit: { label: "Plug", href: "/p", load: first } } } },
    });
    const second = vi.fn(() => ({ label: "Second" }));
    const { items: list } = await signedIn(
      bar(
        {
          adminBar: { items: { edit: { label: "Host", href: "/h", order: 5, load: second } } },
        },
        { plugins: [plugin] },
      ),
    );
    const edit = (await list()).find((i: any) => i.id === "edit");
    expect(edit).toEqual({ id: "edit", label: "Second", href: "/h", order: 5 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("removes hidden items, built-ins too, and runs no loader of theirs", async () => {
    const load = vi.fn(() => ({}));
    const plugin = definePlugin({
      name: "p",
      admin: { adminBar: { items: { x: { label: "X", href: "/x", load } } } },
    });
    const { ids } = await signedIn(
      bar({ adminBar: { items: { x: false, edit: false } } }, { plugins: [plugin] }),
    );
    expect(await ids()).toEqual(["dashboard", "perspective"]);
    expect(load).not.toHaveBeenCalled();
  });

  it("isolates a failing loader, logs it and keeps the other items", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const { items: list } = await signedIn(
        items({
          boom: {
            label: "B",
            order: 1,
            href: "/b",
            load: () => {
              throw new Error("secret detail");
            },
          },
          bad: { label: "X", order: 2, href: "/x", load: () => ({ id: "other" }) },
          ok: { label: "OK", order: 3, href: "/ok", load: () => ({ label: "Fine" }) },
        }),
      );
      const out = await list();
      expect(out.map((i: any) => i.id)).toEqual(["ok", "dashboard", "edit", "perspective"]);
      expect(out[0].label).toBe("Fine");
      const logged = write.mock.calls.map((c) => String(c[0])).join("");
      expect(logged).toContain("boom");
      expect(JSON.stringify(out)).not.toContain("secret detail");
    } finally {
      write.mockRestore();
    }
  });

  it("runs the loaders in parallel", async () => {
    let running = 0;
    let peak = 0;
    const load = async () => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return {};
    };
    const { get } = await signedIn(
      items({
        a: { label: "A", href: "/a", load },
        b: { label: "B", href: "/b", load },
        c: { label: "C", href: "/c", load },
      }),
    );
    await get();
    expect(peak).toBe(3);
  });

  it("answers the fixed preview-tab built-ins and runs no loader", async () => {
    const load = vi.fn(() => ({}));
    const { get } = await signedIn(
      items({
        x: { label: "X", href: "/x", load },
        edit: { label: "Mine", href: "/e", load },
        "live-edit": false,
      }),
    );
    const res = await get("/page", "preview-tab");
    expect(await res.json()).toMatchObject({ items: builtIns("preview-tab") });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(load).not.toHaveBeenCalled();
  });

  it("reads published data, and drafts with the preview cookie, and gives each user their own", async () => {
    const load = async ({ cms, user }: any) => ({
      title: (await cms.find("posts", { populate: false }))[0].title,
      email: user.email,
    });
    const s = setup(items({ n: { label: "N", mount, load } }));
    await s.client.signUp(admin);
    const cms = s.cms as any;
    const doc = await cms.create("posts", { title: "Published" });
    await cms.update("posts", doc.id, { title: "Draft" }, { draft: true });
    const read = async (fetch = s.fetch) =>
      (await (await fetch(`${origin}/_tenon/admin-bar?url=/&mode=site`)).json()).items.find(
        (i: any) => i.id === "n",
      ).data;
    expect(await read()).toEqual({ title: "Published", email: admin.email });

    const second = { name: "Two", email: "two@b.co", password: "password123" };
    await (await cms.auth()).api.signUpEmail({ body: second });
    const other = setup(cms);
    await other.client.signIn({ email: second.email, password: second.password });
    await s.fetch(`${origin}/_tenon/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ perspective: "drafts" }),
    });
    expect(await read()).toEqual({ title: "Draft", email: admin.email });
    expect(await read(other.fetch)).toEqual({ title: "Published", email: second.email });
  });
});

describe("session hint cookie", () => {
  const hint = (res: Response) =>
    res.headers.getSetCookie().find((c) => c.startsWith("tenon-session="));
  const post = (fetch: ReturnType<typeof setup>["fetch"], path: string, body: object = {}) =>
    fetch(`${origin}/_tenon/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("is set on sign-up and sign-in with the session's lifetime and cleared on sign-out", async () => {
    const { fetch } = setup();

    const signUp = hint(await post(fetch, "/sign-up/email", admin));
    expect(signUp).toBe("tenon-session=1; Max-Age=604800; Path=/; SameSite=Lax");

    const signOut = hint(await post(fetch, "/sign-out"));
    expect(signOut).toMatch(/^tenon-session=; Max-Age=0; Path=\//);

    const { name, ...credentials } = admin;
    expect(hint(await post(fetch, "/sign-in/email", credentials))).toBe(signUp);
  });

  it("is left alone by responses without a session cookie", async () => {
    const { fetch } = setup();
    await post(fetch, "/sign-up/email", admin);

    expect(hint(await fetch(`${origin}/_tenon/auth/get-session`))).toBeUndefined();
    const wrong = await post(fetch, "/sign-in/email", {
      email: admin.email,
      password: "wrong-pass",
    });
    expect(wrong.status).toBe(401);
    expect(hint(wrong)).toBeUndefined();
  });

  it("is secure when the session cookie is", async () => {
    const cms = defineCms({ ...base, auth: { advanced: { useSecureCookies: true } } });
    const { fetch } = setup(cms);
    expect(hint(await post(fetch, "/sign-up/email", admin))).toBe(
      "tenon-session=1; Max-Age=604800; Path=/; Secure; SameSite=Lax",
    );
  });
});

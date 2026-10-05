import { describe, expect, it, vi } from "vitest";
import { defineCms, definePlugin } from "../index.ts";
import { builtIns } from "../preview/runtime/admin-bar-items.ts";
import { admin, base, origin, setup } from "./setup.ts";

// Signs up on `cms` and returns a GET of the admin bar for a page URL.
async function signedIn(cms: ReturnType<typeof defineCms>) {
  const { client, fetch } = setup(cms);
  await client.signUp(admin);
  return (url = "/") => fetch(`${origin}/api/cms/admin-bar?url=${encodeURIComponent(url)}`);
}

describe("admin bar endpoint", () => {
  it("answers 401 without a session", async () => {
    const { fetch } = setup();
    expect((await fetch(`${origin}/api/cms/admin-bar?url=/`)).status).toBe(401);
  });

  it("answers the built-in stubs at the top", async () => {
    const get = await signedIn(defineCms(base));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ position: "top", items: builtIns("site") });
  });

  it("answers the configured position", async () => {
    const get = await signedIn(defineCms({ ...base, adminBar: { position: "bottom" } }));
    expect(await (await get()).json()).toMatchObject({ position: "bottom" });
  });

  it("runs plugin hooks in order, then the host's, with the user and the url", async () => {
    const seen: string[][] = [];
    const plugin = (id: string) =>
      definePlugin({
        name: id,
        adminBar: {
          items: (items) => {
            seen.push(items.map((i) => i.id));
            return [...items, { id, label: id }];
          },
        },
      });
    const cms = defineCms({
      ...base,
      plugins: [plugin("one"), plugin("two")],
      adminBar: {
        items: (items, { user, url, cms }) => {
          seen.push(items.map((i) => i.id));
          expect(cms.find).toBeTypeOf("function");
          return [...items, { id: "host", label: user.email, href: url }];
        },
      },
    });
    const get = await signedIn(cms);

    const { items } = await (await get("/posts/a?b=1")).json();
    const stubs = builtIns("site").map((i) => i.id);
    expect(seen).toEqual([stubs, [...stubs, "one"], [...stubs, "one", "two"]]);
    expect(items.at(-1)).toEqual({ id: "host", label: admin.email, href: "/posts/a?b=1" });
  });

  it("logs and skips a hook that throws", async () => {
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const broken = definePlugin({
      name: "broken",
      adminBar: {
        items: () => {
          throw new Error("boom");
        },
      },
    });
    const cms = defineCms({
      ...base,
      plugins: [broken],
      adminBar: { items: (items) => [...items, { id: "host", label: "Host" }] },
    });
    const get = await signedIn(cms);

    const { items } = await (await get()).json();
    expect(items.map((i: { id: string }) => i.id)).toEqual([
      ...builtIns("site").map((i) => i.id),
      "host",
    ]);
    expect(error.mock.calls.join("")).toContain("boom");
    error.mockRestore();
  });

  it("is not mounted with adminBar: false", async () => {
    const get = await signedIn(defineCms({ ...base, adminBar: false }));
    expect((await get()).status).toBe(404);
  });
});

describe("session hint cookie", () => {
  const hint = (res: Response) =>
    res.headers.getSetCookie().find((c) => c.startsWith("integral-session="));
  const post = (fetch: ReturnType<typeof setup>["fetch"], path: string, body: object = {}) =>
    fetch(`${origin}/api/cms/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("is set on sign-up and sign-in with the session's lifetime and cleared on sign-out", async () => {
    const { fetch } = setup();

    const signUp = hint(await post(fetch, "/sign-up/email", admin));
    expect(signUp).toBe("integral-session=1; Max-Age=604800; Path=/; SameSite=Lax");

    const signOut = hint(await post(fetch, "/sign-out"));
    expect(signOut).toMatch(/^integral-session=; Max-Age=0; Path=\//);

    const { name, ...credentials } = admin;
    expect(hint(await post(fetch, "/sign-in/email", credentials))).toBe(signUp);
  });

  it("is left alone by responses without a session cookie", async () => {
    const { fetch } = setup();
    await post(fetch, "/sign-up/email", admin);

    expect(hint(await fetch(`${origin}/api/cms/auth/get-session`))).toBeUndefined();
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
      "integral-session=1; Max-Age=604800; Path=/; Secure; SameSite=Lax",
    );
  });
});

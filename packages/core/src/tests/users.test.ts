import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError, defineCms, type EmailMessage } from "../index.ts";
import { admin, base, origin, post, setup, withAdmin } from "./setup.ts";

const ed = { email: "ed@b.co", name: "Ed", role: "editor", password: "password123" };

afterEach(() => vi.useRealTimers());

describe("cms.users", () => {
  it("creates users, the first as an admin", async () => {
    const { cms, client } = setup();
    expect(await cms.users.hasUsers()).toBe(false);
    expect(await cms.users.create({ ...admin, role: "editor" })).toMatchObject({ role: "admin" });
    expect(await cms.users.hasUsers()).toBe(true);
    expect(await cms.users.create(ed)).toMatchObject({ email: ed.email, role: "editor" });
    await client.signIn({ email: ed.email, password: ed.password });
    expect(await client.getSession()).toMatchObject({ user: { email: ed.email } });
  });

  it("refuses a short password", async () => {
    const { cms } = setup();
    await expect(cms.users.create({ ...ed, password: "short" })).rejects.toThrow(/at least 8/);
  });

  // Like the `tenon` CLI: no base URL and no request before the calls.
  it.each(["development", "production"])(
    "works in %s without a base URL or a request",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      for (const name of ["BETTER_AUTH_URL", "__TENON_DEV_ORIGIN"]) vi.stubEnv(name, undefined);
      try {
        const { cms } = setup(defineCms(base));
        await cms.users.create(admin);
        await cms.users.create(ed);
        expect((await cms.users.list()).map((u) => u.email)).toEqual([admin.email, ed.email]);
        await expect(cms.users.deactivate(admin.email)).rejects.toThrow(/one admin/);
        await cms.users.deactivate(ed.email);
        await cms.users.reactivate(ed.email);
        const { link } = await cms.users.signInLink(admin.email, {
          origin: "http://localhost:4321",
        });
        expect(link).toMatch("http://localhost:4321/_tenon/auth/sign-in-link?token=");
        await cms.users.remove(ed.email);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("lists the built-in roles, then the host's", () => {
    const { cms } = setup(defineCms({ ...base, roles: { reviewer: { label: "Reviewer" } } }));
    expect(cms.users.roles().map((r) => r.name)).toEqual(["admin", "editor", "reviewer"]);
  });

  it("works only for server code, not on a withSession() copy", async () => {
    const { cms } = setup();
    await cms.users.create(admin);
    const scoped = await cms.withSession(new Request(origin));
    await expect(scoped.users.create(ed)).rejects.toThrow("Forbidden");
    await expect(scoped.users.list()).rejects.toThrow("Forbidden");
    await expect(scoped.users.deactivate(admin.email)).rejects.toThrow("Forbidden");
    await expect(scoped.users.reactivate(admin.email)).rejects.toThrow("Forbidden");
    await expect(scoped.users.remove(admin.email)).rejects.toThrow("Forbidden");
    expect(() => scoped.users.roles()).toThrow("Forbidden");
  });
});

describe("managing users", () => {
  async function env() {
    const { cms } = setup();
    await cms.users.create(admin);
    await cms.users.create(ed);
    const signedIn = setup(cms);
    await signedIn.client.signIn({ email: ed.email, password: ed.password });
    return { cms, signedIn };
  }

  it("lists the users with role and status", async () => {
    const { cms } = await env();
    expect(await cms.users.list()).toEqual([
      expect.objectContaining({ email: admin.email, role: "admin", deactivated: false }),
      expect.objectContaining({ email: ed.email, name: "Ed", role: "editor", deactivated: false }),
    ]);
  });

  it("deactivates a user: their sessions end and sign-in fails", async () => {
    const { cms, signedIn } = await env();
    await cms.users.deactivate(ed.email);
    expect(await signedIn.client.getSession()).toBeNull();
    await expect(setup(cms).client.signIn(ed)).rejects.toThrow(/banned/i);
    expect(await cms.users.list()).toContainEqual(
      expect.objectContaining({ email: ed.email, deactivated: true }),
    );
  });

  it("reactivates a user, who can sign in again", async () => {
    const { cms } = await env();
    await cms.users.deactivate(ed.email);
    await cms.users.reactivate(ed.email);
    const again = setup(cms);
    await again.client.signIn(ed);
    expect(await again.client.getSession()).toMatchObject({ user: { email: ed.email } });
  });

  it("removes a user and ends their sessions", async () => {
    const { cms, signedIn } = await env();
    await cms.users.remove(ed.email);
    expect(await signedIn.client.getSession()).toBeNull();
    expect((await cms.users.list()).map((u) => u.email)).toEqual([admin.email]);
  });

  it("keeps the last active admin", async () => {
    const { cms } = await env();
    await expect(cms.users.deactivate(admin.email)).rejects.toThrow(/one admin/);
    await expect(cms.users.remove(admin.email)).rejects.toThrow(/one admin/);
    await expect(cms.users.remove(admin.email)).rejects.toBeInstanceOf(ConflictError);

    await cms.users.create({ email: "b@b.co", name: "B", role: "admin" });
    await cms.users.deactivate("b@b.co");
    await expect(cms.users.remove(admin.email)).rejects.toThrow(/one admin/);
    await cms.users.reactivate("b@b.co");
    await cms.users.deactivate(admin.email);
    await cms.users.remove(admin.email);
  });

  it("refuses an unknown email", async () => {
    const { cms } = await env();
    await expect(cms.users.deactivate("nobody@b.co")).rejects.toThrow(/No user/);
    await expect(cms.users.reactivate("nobody@b.co")).rejects.toThrow(/No user/);
    await expect(cms.users.remove("nobody@b.co")).rejects.toThrow(/No user/);
  });

  it("answers 404 to an admin's request for a server-only endpoint", async () => {
    const { fetch, me } = await withAdmin();
    const body = { email: admin.email, userId: me.id };
    expect((await fetch(`${origin}/_tenon/auth/tenon/list-users`)).status).toBe(404);
    for (const path of [
      "deactivate-user",
      "reactivate-user",
      "remove-user",
      "sign-in-user",
      "create-sign-in-link",
    ])
      expect((await post(fetch, `/auth/tenon/${path}`, body)).status).toBe(404);
  });
});

describe("sign-in links", () => {
  async function env(email?: EmailMessage[]) {
    const cms = defineCms({
      ...base,
      // Tests skip better-auth's origin check by default.
      auth: { ...base.auth, advanced: { disableOriginCheck: false } },
      ...(email && {
        email: { from: "cms@example.com", adapter: { send: async (m) => void email.push(m) } },
      }),
    });
    const owner = setup(cms);
    await owner.client.signUp(admin);
    const open = (link: string) => setup(cms).fetch(link, { redirect: "manual" });
    return { cms, owner, open };
  }

  it("signs in once, ends the other sessions and opens the account settings", async () => {
    const { cms, owner, open } = await env();
    const { link, sent } = await cms.users.signInLink(admin.email, { origin });
    expect(sent).toBe(false);
    expect(link).toMatch(`${origin}/_tenon/auth/sign-in-link?token=`);

    const guest = setup(cms);
    const res = await guest.fetch(link, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/?settings=security");
    expect(await guest.client.getSession()).toMatchObject({ user: { email: admin.email } });
    expect(await owner.client.getSession()).toBeNull();

    expect((await open(link)).headers.get("location")).toBe(
      `${origin}/admin/login?error=INVALID_TOKEN`,
    );
  });

  it("expires after an hour", async () => {
    const { cms, open } = await env();
    const { link } = await cms.users.signInLink(admin.email, { origin });
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 61 * 60 * 1000 });
    expect((await open(link)).headers.get("location")).toContain("error=INVALID_TOKEN");
  });

  it("redirects only to a trusted origin", async () => {
    const { cms, open } = await env();
    const { link } = await cms.users.signInLink(admin.email, { origin });
    expect((await open(`${link}&callbackURL=https://evil.example/`)).status).toBe(403);
    expect((await open(`${link}&errorCallbackURL=https://evil.example/`)).status).toBe(403);
    const res = await open(`${link}&callbackURL=/admin/`);
    expect(res.headers.get("location")).toBe("/admin/");
    const used = await open(`${link}&errorCallbackURL=/cms/login`);
    expect(used.headers.get("location")).toBe(`${origin}/cms/login?error=INVALID_TOKEN`);
  });

  it("refuses an unknown email", async () => {
    const { cms } = await env();
    await expect(cms.users.signInLink("nobody@b.co", { origin })).rejects.toThrow();
  });

  it("emails the link when email is set up", async () => {
    const sent: EmailMessage[] = [];
    const { cms } = await env(sent);
    const result = await cms.users.signInLink(admin.email, { origin });
    expect(result.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: admin.email });
    expect(sent[0].text).toContain(result.link);
  });
});

import { passkey } from "@better-auth/passkey";
import { describe, expect, it } from "vitest";
import { defineCms, type EmailAdapter, type EmailMessage } from "../index.ts";
import { admin, base, origin, setup, testDb } from "./setup.ts";

type Fetch = ReturnType<typeof setup>["fetch"];
const url = `${origin}/admin/invite`;
const ed = { name: "Ed", password: "password123" };

const call = (fetch: Fetch, method: string, path: string, body?: unknown) =>
  fetch(`${origin}/_tenon${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

/** An instance on a file DB, so tests can read and change rows, with a signed-in admin. */
async function env(email?: { adapter: EmailAdapter }) {
  const { database, exec } = testDb();
  const cms = defineCms({
    ...base,
    database,
    roles: { author: { label: "Author" } },
    ...(email && { email: { from: "cms@example.com", ...email } }),
  });
  const owner = setup(cms);
  await owner.client.signUp(admin);
  const invite = async (body: object = {}) =>
    json(
      await call(owner.fetch, "POST", "/invites", {
        email: "e@b.co",
        role: "editor",
        url,
        ...body,
      }),
    );
  const sql = (statement: string) => exec(statement);
  return { cms, owner, invite, sql, guest: () => setup(cms) };
}

const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;

describe("invites", () => {
  it("creates, checks and accepts an invite", async () => {
    const { invite, guest, owner } = await env();
    const created = await invite({ role: "author" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      invite: { email: "e@b.co", role: "author", expired: false },
      sent: false,
    });
    const token = tokenOf(created.body.link);
    expect(created.body.link).toBe(`${url}?token=${token}`);

    const g = guest();
    expect(await json(await call(g.fetch, "POST", "/invites/check", { token }))).toEqual({
      status: 200,
      body: { email: "e@b.co", role: "author", label: "Author" },
    });
    const accepted = await call(g.fetch, "POST", "/invites/accept", { token, ...ed });
    expect(accepted.status).toBe(200);
    const cookies = accepted.headers.getSetCookie().map((c) => c.split("=")[0]);
    expect(cookies).toEqual(expect.arrayContaining(["better-auth.session_token", "tenon-session"]));
    expect(await g.client.getSession()).toMatchObject({
      user: { email: "e@b.co", name: "Ed", role: "author", emailVerified: true },
    });
    expect((await json(await call(owner.fetch, "GET", "/invites"))).body).toEqual([]);
  });

  it("works through client.invites", async () => {
    const { owner, guest } = await env();
    const { invite, link } = await owner.client.invites.create({
      email: "e@b.co",
      role: "editor",
      url,
    });
    expect(await owner.client.invites.list()).toEqual([invite]);
    const resent = await owner.client.invites.resend(invite.id, { url });
    expect(resent.link).not.toBe(link);
    const g = guest().client;
    const token = tokenOf(resent.link);
    expect(await g.invites.check(token)).toEqual({
      email: "e@b.co",
      role: "editor",
      label: { en: "Editor", de: "Redakteur" },
    });
    expect(await g.invites.accept({ token, ...ed })).toMatchObject({ user: { email: "e@b.co" } });
    expect(await g.getSession()).toMatchObject({ user: { role: "editor" } });

    const second = await owner.client.invites.create({ email: "x@b.co", role: "editor", url });
    await owner.client.invites.revoke(second.invite.id);
    expect(await owner.client.invites.list()).toEqual([]);
  });

  it("lists pending invites without tokens and stores only the hash of a token", async () => {
    const { invite, owner, sql } = await env();
    const token = tokenOf((await invite()).body.link);
    const list = await json(await call(owner.fetch, "GET", "/invites"));
    expect(list.body).toEqual([
      {
        id: expect.any(String),
        email: "e@b.co",
        role: "editor",
        invitedBy: expect.any(String),
        expiresAt: expect.any(String),
        createdAt: expect.any(String),
        expired: false,
      },
    ]);
    const [row] = await sql("SELECT * FROM cms_invites");
    expect(Object.values(row)).not.toContain(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lets only admins manage invites", async () => {
    const { cms, invite } = await env();
    const { body } = await invite();
    const g = setup(cms);
    await call(g.fetch, "POST", "/invites/accept", { token: tokenOf(body.link), ...ed });
    const second = (await invite({ email: "x@b.co" })).body.invite.id;
    expect((await call(g.fetch, "GET", "/invites")).status).toBe(403);
    expect(
      (await call(g.fetch, "POST", "/invites", { email: "y@b.co", role: "editor", url })).status,
    ).toBe(403);
    expect((await call(g.fetch, "POST", `/invites/${second}/resend`, { url })).status).toBe(403);
    expect((await call(g.fetch, "DELETE", `/invites/${second}`)).status).toBe(403);
  });

  it("rejects a used, revoked or expired token", async () => {
    const { invite, guest, owner, sql } = await env();
    const used = tokenOf((await invite()).body.link);
    await call(guest().fetch, "POST", "/invites/accept", { token: used, ...ed });

    const revoked = await invite({ email: "r@b.co" });
    await call(owner.fetch, "DELETE", `/invites/${revoked.body.invite.id}`);

    const expired = tokenOf((await invite({ email: "x@b.co" })).body.link);
    await sql(`UPDATE cms_invites SET expires_at = 0 WHERE email = 'x@b.co'`);

    for (const token of [used, tokenOf(revoked.body.link), expired, "nope"]) {
      const g = guest();
      expect((await call(g.fetch, "POST", "/invites/check", { token })).status).toBe(404);
      expect((await call(g.fetch, "POST", "/invites/accept", { token, ...ed })).status).toBe(404);
    }
  });

  it("refuses an email that has a user or a pending invite, and replaces an expired one", async () => {
    const { invite, sql } = await env();
    expect((await invite({ email: admin.email })).status).toBe(409);
    await invite();
    expect((await invite({ email: "E@B.co" })).status).toBe(409);
    await sql(`UPDATE cms_invites SET expires_at = 0`);
    expect((await invite({ role: "author" })).status).toBe(201);
    expect(await sql("SELECT role FROM cms_invites")).toEqual([
      expect.objectContaining({ role: "author" }),
    ]);
  });

  it("validates the email, role and url", async () => {
    const { invite } = await env();
    expect(await invite({ email: "nope" })).toMatchObject({
      status: 400,
      body: { errors: { email: expect.any(String) } },
    });
    expect(await invite({ role: "owner" })).toMatchObject({
      status: 400,
      body: { errors: { role: expect.any(String) } },
    });
    expect(await invite({ url: "https://evil.example/invite" })).toMatchObject({
      status: 400,
      body: { errors: { url: expect.any(String) } },
    });
  });

  it("validates the email and url of an invite from server code, and stores nothing", async () => {
    const { cms, sql } = await env();
    await expect(
      cms.users.invite({ email: "not an email", role: "editor", url }),
    ).rejects.toMatchObject({ errors: { email: expect.any(String) } });
    await expect(
      cms.users.invite({ email: "e@b.co", role: "editor", url: "not a url" }),
    ).rejects.toMatchObject({ errors: { url: expect.stringContaining("absolute") } });
    expect(await sql("SELECT id FROM cms_invites")).toEqual([]);
  });

  it("links into the admin on `auth.baseURL`, while the sitemap uses `site.url`", async () => {
    const cms = defineCms({
      ...base,
      collections: { posts: { permalink: "/posts/{slug}", fields: { slug: { type: "text" } } } },
      site: { url: "https://site.example" },
      auth: { ...base.auth, baseURL: "https://cms.example" },
    });
    const owner = setup(cms);
    await owner.client.signUp(admin);
    await cms.create("posts", { slug: "a" });
    const page = "https://cms.example/admin/invite";

    const { link } = await owner.client.invites.create({
      email: "e@b.co",
      role: "editor",
      url: page,
    });
    expect(link).toMatch(`${page}?token=`);
    expect(
      await json(
        await call(owner.fetch, "POST", "/invites", {
          email: "f@b.co",
          role: "editor",
          url: "https://site.example/admin/invite",
        }),
      ),
    ).toMatchObject({ status: 400, body: { errors: { url: expect.any(String) } } });
    expect((await cms.sitemap()).map((e) => e.url)).toEqual(["https://site.example/posts/a"]);
  });

  it("links to the invite page under `admin.path` without a `url`", async () => {
    const cms = defineCms({ ...base, admin: { path: "/cms" } });
    const owner = setup(cms);
    await owner.client.signUp(admin);

    const { link } = await owner.client.invites.create({ email: "e@b.co", role: "editor" });
    expect(link).toMatch(`${origin}/cms/invite?token=`);
    const local = defineCms({
      ...base,
      site: { url: "https://site.example" },
      admin: { path: "/cms" },
    });
    expect((await local.users.invite({ email: "f@b.co", role: "editor" })).link).toMatch(
      "https://site.example/cms/invite?token=",
    );
  });

  it("needs a `url` without an admin", async () => {
    const cms = defineCms({ ...base, site: { url: "https://site.example" }, admin: false });
    await expect(cms.users.invite({ email: "e@b.co", role: "editor" })).rejects.toThrow(/no admin/);
  });

  it("gives a resent invite a new token", async () => {
    const { invite, guest, owner } = await env();
    const { body } = await invite();
    const resent = await json(
      await call(owner.fetch, "POST", `/invites/${body.invite.id}/resend`, { url }),
    );
    expect(resent.status).toBe(200);
    const g = guest();
    expect(
      (await call(g.fetch, "POST", "/invites/check", { token: tokenOf(body.link) })).status,
    ).toBe(404);
    expect(
      (await call(g.fetch, "POST", "/invites/check", { token: tokenOf(resent.body.link) })).status,
    ).toBe(200);
    expect((await call(owner.fetch, "POST", "/invites/missing/resend", { url })).status).toBe(404);
    expect((await call(owner.fetch, "DELETE", "/invites/missing")).status).toBe(404);
  });

  it("keeps the invite for a short password or a body that is not JSON", async () => {
    const { invite, guest } = await env();
    const token = tokenOf((await invite()).body.link);
    const g = guest();
    expect(
      (await call(g.fetch, "POST", "/invites/accept", { token, name: "Ed", password: "short" }))
        .status,
    ).toBe(400);
    const text = await g.fetch(`${origin}/_tenon/invites/accept`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ token, ...ed }),
    });
    expect(text.status).toBe(415);
    expect(
      await json(await call(g.fetch, "POST", "/invites/accept", { token, name: "Ed" })),
    ).toMatchObject({
      status: 400,
      body: { errors: { password: expect.any(String) } },
    });
    expect((await call(g.fetch, "POST", "/invites/accept", { token, ...ed })).status).toBe(200);
  });

  it("puts the invite back when better-auth rejects the user", async () => {
    const { invite, guest, owner } = await env();
    const token = tokenOf((await invite()).body.link);
    await call(owner.fetch, "POST", "/auth/admin/create-user", { email: "e@b.co", ...ed });
    const res = await call(guest().fetch, "POST", "/invites/accept", { token, ...ed });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect((await json(await call(owner.fetch, "GET", "/invites"))).body).toHaveLength(1);
  });

  it("emails the invite", async () => {
    const sent: Omit<EmailMessage, "from">[] = [];
    const { invite } = await env({ adapter: { send: async (m) => void sent.push(m) } });
    const { status, body } = await invite();
    expect(status).toBe(201);
    expect(body.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "e@b.co", subject: "You are invited to tenoncms" });
    expect(sent[0].text).toContain(body.link);
    expect(sent[0].text).toContain("Admin invited you to tenoncms as Editor.");
  });

  it("invites from server code, as the actor cli", async () => {
    const sent: Omit<EmailMessage, "from">[] = [];
    const { cms, guest } = await env({ adapter: { send: async (m) => void sent.push(m) } });
    const created = await cms.users.invite({ email: "e@b.co", role: "editor", url });
    expect(created).toMatchObject({ invite: { invitedBy: "cli" }, sent: true });
    expect(sent[0].text).toContain("You are invited to tenoncms as Editor.");

    const g = guest();
    const token = tokenOf(created.link);
    expect((await call(g.fetch, "POST", "/invites/accept", { token, ...ed })).status).toBe(200);
    expect(await g.client.getSession()).toMatchObject({ user: { email: "e@b.co" } });
  });

  it("answers 502 with the link when sending fails, and keeps the invite", async () => {
    const { invite, owner } = await env({
      adapter: { send: async () => Promise.reject(new Error("SMTP down")) },
    });
    const { status, body } = await invite();
    expect(status).toBe(502);
    expect(body).toMatchObject({
      sent: false,
      link: expect.stringContaining("token="),
      message: expect.any(String),
    });
    expect((await json(await call(owner.fetch, "GET", "/invites"))).body).toHaveLength(1);
  });
});

describe("invites with password and another method", () => {
  it("accepts without a password, which the user MAY set right after", async () => {
    const cms = defineCms({ ...base, auth: { ...base.auth, plugins: [passkey()] } });
    await cms.users.create(admin);
    const invite = async () =>
      tokenOf((await cms.users.invite({ email: "e@b.co", role: "editor", url })).link);

    const g = setup(cms);
    await g.client.invites.accept({ token: await invite(), name: "Ed" });
    expect(await g.client.getSession()).toMatchObject({ user: { email: "e@b.co" } });
    const set = await call(g.fetch, "POST", "/account/password", { newPassword: "password123" });
    expect(set.status).toBe(200);
    await setup(cms).client.signIn({ email: "e@b.co", password: "password123" });

    await cms.users.remove("e@b.co");
    const short = { token: await invite(), name: "Ed", password: "short" };
    expect((await call(setup(cms).fetch, "POST", "/invites/accept", short)).status).toBe(400);
  });
});

describe("invites without a password", () => {
  async function env() {
    const { database, exec } = testDb();
    const cms = defineCms({
      ...base,
      database,
      auth: { emailAndPassword: { enabled: false }, plugins: [passkey()] },
    });
    await cms.users.create({ name: "Admin", email: admin.email });
    const token = tokenOf((await cms.users.invite({ email: "e@b.co", role: "editor", url })).link);
    return { cms, token, sql: exec };
  }
  const pending = async (sql: (s: string) => Promise<unknown[]>) =>
    (await sql("SELECT email FROM cms_invites")).length;

  it("accepts with a name only, and signs in", async () => {
    const { cms, token, sql } = await env();
    const g = setup(cms);
    expect(await g.client.invites.accept({ token, name: "Ed" })).toMatchObject({
      user: { email: "e@b.co" },
    });
    expect(await g.client.getSession()).toMatchObject({
      user: { email: "e@b.co", name: "Ed", role: "editor" },
    });
    expect(await sql("SELECT * FROM account")).toEqual([]);
    expect(
      (await call(setup(cms).fetch, "POST", "/invites/accept", { token, name: "Ed" })).status,
    ).toBe(404);
  });

  it("rejects a password, and keeps the invite", async () => {
    const { cms, token, sql } = await env();
    expect(
      await json(await call(setup(cms).fetch, "POST", "/invites/accept", { token, ...ed })),
    ).toMatchObject({ status: 400, body: { errors: { password: expect.any(String) } } });
    expect(await pending(sql)).toBe(1);
  });

  it("puts the invite back when better-auth rejects the user", async () => {
    const { cms, token, sql } = await env();
    await cms.users.create({ name: "Ed", email: "e@b.co" });
    const res = await call(setup(cms).fetch, "POST", "/invites/accept", { token, name: "Ed" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await pending(sql)).toBe(1);
  });
});

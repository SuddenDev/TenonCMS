import { createClient as createLibsql } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { defineCms, type EmailAdapter, type EmailMessage } from "../index.ts";
import { admin, base, origin, setup, tmpDb } from "./setup.ts";

type Fetch = ReturnType<typeof setup>["fetch"];
const url = `${origin}/admin/invite`;
const ed = { name: "Ed", password: "password123" };

const call = (fetch: Fetch, method: string, path: string, body?: unknown) =>
  fetch(`${origin}/api/cms${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

/** An instance on a file DB, so tests can read and change rows, with a signed-in admin. */
async function env(email?: { adapter: EmailAdapter }) {
  const database = tmpDb();
  const cms = defineCms({
    ...base,
    database: { url: database },
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
  const sql = async (statement: string) => {
    const db = createLibsql({ url: database });
    try {
      return (await db.execute(statement)).rows;
    } finally {
      db.close();
    }
  };
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
    expect(cookies).toEqual(
      expect.arrayContaining(["better-auth.session_token", "integral-session"]),
    );
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

  it("lists pending invites without tokens", async () => {
    const { invite, owner } = await env();
    await invite();
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
  });

  it("stores only the hash of a token", async () => {
    const { invite, sql } = await env();
    const token = tokenOf((await invite()).body.link);
    const [row] = await sql("SELECT * FROM cms_invites");
    expect(Object.values(row)).not.toContain(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lets only admins manage invites", async () => {
    const { cms, invite, owner } = await env();
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

  it("keeps the invite when the password is too short", async () => {
    const { invite, guest } = await env();
    const token = tokenOf((await invite()).body.link);
    const g = guest();
    expect(
      (await call(g.fetch, "POST", "/invites/accept", { token, name: "Ed", password: "short" }))
        .status,
    ).toBe(400);
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

  it("accepts only JSON", async () => {
    const { invite, guest } = await env();
    const token = tokenOf((await invite()).body.link);
    const res = await guest().fetch(`${origin}/api/cms/invites/accept`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ token, ...ed }),
    });
    expect(res.status).toBe(415);
  });

  it("emails the invite", async () => {
    const sent: Omit<EmailMessage, "from">[] = [];
    const { invite } = await env({ adapter: { send: async (m) => void sent.push(m) } });
    const { status, body } = await invite();
    expect(status).toBe(201);
    expect(body.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "e@b.co", subject: "You are invited to integral-cms" });
    expect(sent[0].text).toContain(body.link);
    expect(sent[0].text).toContain("Admin invited you to integral-cms as Editor.");
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

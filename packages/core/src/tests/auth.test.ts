import { createAuthMiddleware } from "better-auth/api";
import { admin as adminPlugin, anonymous, twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineCms } from "../index.ts";
import { clientRef } from "../admin/config.ts";
import { admin, base, fresh, origin, post, setup, status, type Env, testDb } from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("database", () => {
  it("creates CMS and auth tables on first access", async () => {
    const { database, tables } = testDb();
    const cms = defineCms({
      collections: { posts: { fields: {} } },
      database,
      secret: "x".repeat(32),
    });
    await cms.find("posts");
    await cms.auth();
    expect(await tables()).toEqual(
      expect.arrayContaining([
        "cms_documents",
        "cms_globals",
        "user",
        "session",
        "account",
        "verification",
        "rateLimit",
      ]),
    );
  });

  // Serverless instances do not share memory.
  it("keeps rate limits in memory only when the host asks", async () => {
    const { database, tables } = testDb();
    const cms = defineCms({ ...base, database, auth: { rateLimit: { storage: "memory" } } });
    await cms.auth();
    expect(await tables()).not.toContain("rateLimit");
  });
});

describe("auth", () => {
  it("lets only the first user sign up", async () => {
    await client.signUp(admin);
    expect(await client.getSession()).toMatchObject({ user: { email: admin.email } });
    expect(await status(client.signUp({ ...admin, email: "c@d.co" }))).toBe(403);
  });

  it("reports first-admin setup until a user exists", async () => {
    const closed = { setup: false, signUp: false, passkeys: false };
    expect(await client.request("/auth-status")).toEqual({ ...closed, setup: true, signUp: true });
    await client.signUp(admin);
    await client.signOut();
    expect(await client.request("/auth-status")).toEqual(closed);
  });

  it("has no passkeys without the host's plugin", async () => {
    expect(await status(client.request("/auth/passkey/generate-authenticate-options"))).toBe(404);
  });

  it("offers passkeys with the host's plugin, named after the admin", async () => {
    const { client } = setup(
      defineCms({
        ...base,
        admin: { name: "Acme" },
        auth: { plugins: [passkey({ rpID: "cms.test" })] },
      }),
    );
    const options = await client.request<{ rpId: string }>(
      "/auth/passkey/generate-authenticate-options",
    );
    expect(options.rpId).toBe("cms.test");
    expect(await client.request("/auth-status")).toMatchObject({ passkeys: true });
    await client.signUp(admin);
    const registration = await client.request<{ rp: { name: string } }>(
      "/auth/passkey/generate-register-options",
    );
    expect(registration.rp.name).toBe("Acme");
  });

  it("stores the admin preferences on the user", async () => {
    await client.signUp(admin);
    const update = (body: object) => client.request("/auth/update-user", { method: "POST", body });
    await update({ language: "de", timezone: "Europe/Berlin" });
    expect((await client.getSession())?.user).toMatchObject({
      language: "de",
      timezone: "Europe/Berlin",
    });
    await update({ timezone: null });
    expect((await client.getSession())?.user).toMatchObject({ language: "de", timezone: null });
    expect(await status(update({ language: "fr" }))).toBe(400);
    expect(await status(update({ timezone: "Mars/Base" }))).toBe(400);
  });

  it("sets a first password, but never replaces one", async () => {
    const { database, exec } = testDb();
    const { client } = setup(defineCms({ ...base, database }));
    const set = (newPassword: string) =>
      client.request("/account/password", { method: "POST", body: { newPassword } });
    expect(await status(set("password456"))).toBe(401);
    await client.signUp(admin);
    expect(await status(set("password456"))).toBe(400);
    await exec(`DELETE FROM account WHERE "providerId" = 'credential'`);
    await set("password456");
    await client.signOut();
    await client.signIn({ email: admin.email, password: "password456" });
    expect(await client.getSession()).not.toBeNull();
  });

  it("creates plugin tables at runtime and types plugin endpoints", async () => {
    const { database, tables } = testDb();
    const cms = defineCms({ ...base, database, auth: { plugins: [twoFactor()] } });
    const auth = await cms.auth();
    expect(typeof auth.api.enableTwoFactor).toBe("function");
    expect(await tables()).toContain("twoFactor");
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
    const res = await fetch(`${origin}/_tenon/auth/admin/create-user`, {
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
      new Request(`${origin}/_tenon/auth/sign-in/anonymous`, {
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

describe("sessions", () => {
  it("are looked up once per request", async () => {
    const mount = clientRef("./m");
    const cms = defineCms({ ...base, admin: { pages: { stats: { mount, load: () => 1 } } } });
    const { client, fetch } = setup(cms);
    await client.signUp(admin);
    const lookups = vi.spyOn((await cms.auth()).api, "getSession");
    const at = (path: string) => fetch(`${origin}/_tenon${path}`);
    const load = { kind: "page", key: "stats", params: {}, query: {} };

    for (const send of [
      () => at("/collections/posts"),
      () => at("/globals/site"),
      () => post(fetch, "/collections/posts", { title: "A" }),
      () => at("/schema"),
      () => post(fetch, "/admin/load", load),
      () => at("/admin-bar?url=/&mode=site"),
    ]) {
      lookups.mockClear();
      expect((await send()).status).toBeLessThan(300);
      expect(lookups, String(send)).toHaveBeenCalledTimes(1);
    }
  });
});

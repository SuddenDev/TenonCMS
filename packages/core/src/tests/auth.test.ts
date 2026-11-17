import { createAuthMiddleware } from "better-auth/api";
import { admin as adminPlugin, anonymous, twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineCms, type EmailMessage } from "../index.ts";
import { emailOTP, magicLink } from "../auth/plugins.ts";
import { clientRef } from "../admin/config.ts";
import {
  admin,
  base,
  fresh,
  origin,
  post,
  setup,
  status,
  type Env,
  testDb,
  withAdmin,
} from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("development auth origins", () => {
  const development = () =>
    setup(
      defineCms({
        ...base,
        auth: { ...base.auth, advanced: { disableOriginCheck: false } },
      }),
    );
  let cms: ReturnType<typeof development>["cms"];
  let client: ReturnType<typeof development>["client"];
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    vi.stubEnv("__TENON_DEV_ORIGIN", "http://localhost:4329");
    ({ cms, client } = development());
  });
  afterEach(() => vi.unstubAllEnvs());

  it("learns a worker's origin per instance after early auth initialization", async () => {
    vi.stubEnv("__TENON_DEV_ORIGIN", undefined);
    await cms.auth();
    await client.signUp(admin);
    const key = await client.apiKeys.create({
      name: "Worker",
      permissions: { "collection:posts": ["read"] },
    });
    expect(key.key).toBeTruthy();
    expect((await cms.auth()).options.baseURL).toMatchObject({ fallback: origin });

    const second = development().cms;
    await second.fetch(new Request("http://127.0.0.1:4331/_tenon/auth-status"));
    expect((await second.auth()).options.baseURL).toMatchObject({
      fallback: "http://127.0.0.1:4331",
    });
  });

  it.each(["http://localhost:4329", "http://127.0.0.1:4329", "http://[::1]:4329"])(
    "signs in on %s and preserves requestless API key calls",
    async (url) => {
      const res = await cms.fetch(
        new Request(`${url}/_tenon/auth/sign-up/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: url },
          body: JSON.stringify(admin),
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie().join(";")).toContain("better-auth.session_token");

      await client.signIn(admin);
      const { key } = await client.apiKeys.create({
        name: "Read",
        permissions: { "collection:posts": ["read"] },
      });
      const read = await cms.fetch(
        new Request(`${url}/_tenon/collections/posts`, {
          headers: { "x-api-key": key },
        }),
      );
      expect(read.status).toBe(200);
    },
  );

  it("accepts invites through the requestless user API", async () => {
    await client.signUp(admin);
    const { link } = await client.invites.create({
      email: "invite@example.com",
      role: "editor",
      url: `${origin}/admin/invite`,
    });
    const token = new URL(link).searchParams.get("token")!;
    const guest = setup(cms).client;
    expect(
      await guest.invites.accept({ token, name: "Editor", password: "password123" }),
    ).toMatchObject({ user: { email: "invite@example.com" } });
    expect(await guest.getSession()).toMatchObject({ user: { role: "editor" } });
  });

  it("builds reset links on the incoming allowed origin", async () => {
    let resetURL = "";
    const cms = defineCms({
      ...base,
      auth: {
        ...base.auth,
        emailAndPassword: {
          ...base.auth.emailAndPassword,
          sendResetPassword: async ({ url }) => {
            resetURL = url;
          },
        },
      },
    });
    const env = setup(cms);
    await env.client.signUp(admin);
    const url = "http://127.0.0.1:4330";
    const res = await cms.fetch(
      new Request(`${url}/_tenon/auth/request-password-reset`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: url },
        body: JSON.stringify({ email: admin.email, redirectTo: `${url}/admin/reset-password` }),
      }),
    );
    expect(res.status).toBe(200);
    expect(resetURL).toMatch(/^http:\/\/127\.0\.0\.1:4330\/_tenon\/auth\/reset-password\//);
  });

  it("rejects unrelated hosts and cross-origin requests", async () => {
    const send = (url: string, requestOrigin = url) =>
      cms.fetch(
        new Request(`${url}/_tenon/auth/sign-up/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: requestOrigin },
          body: JSON.stringify(admin),
        }),
      );
    expect((await send("http://localhost:4329", "https://evil.example")).status).toBe(403);
    expect((await send("https://evil.example")).status).toBeGreaterThanOrEqual(400);
  });
});

describe("auth base URL", () => {
  it("defaults to `site.url`, and `auth.baseURL` wins", async () => {
    const site = defineCms({ ...base, site: { url: "https://site.example/" } });
    expect((await site.auth()).options.baseURL).toBe("https://site.example");

    const both = defineCms({
      ...base,
      site: { url: "https://site.example" },
      auth: { ...base.auth, baseURL: "https://cms.example" },
    });
    expect((await both.auth()).options.baseURL).toBe("https://cms.example");
  });
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
  it("lets only the first user sign up, and reports setup until then", async () => {
    const closed = { setup: false, signUp: false, passkeys: false };
    expect(await client.request("/auth-status")).toMatchObject({ setup: true, signUp: true });
    await client.signUp(admin);
    expect(await client.getSession()).toMatchObject({ user: { email: admin.email } });
    await client.signOut();
    expect(await client.request("/auth-status")).toMatchObject(closed);
    expect(await status(client.signUp({ ...admin, email: "c@d.co" }))).toBe(403);
  });

  it("has no passkeys without the host's plugin", async () => {
    expect(await status(client.request("/auth/passkey/generate-authenticate-options"))).toBe(404);
  });

  it("offers passkeys with the host's plugin, named after the site", async () => {
    const { client } = setup(
      defineCms({
        ...base,
        site: { name: "Acme" },
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

  it("keeps the host's other email options", async () => {
    const { client } = setup(
      defineCms({ ...base, auth: { emailAndPassword: { enabled: true, minPasswordLength: 20 } } }),
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

describe("sign-in methods", () => {
  type Sent = Omit<EmailMessage, "from">[];
  const passwordOff = { emailAndPassword: { enabled: false } };
  const withEmail = (sent: Sent) => ({
    email: {
      from: "cms@example.com",
      adapter: { send: async (m: EmailMessage) => void sent.push(m) },
    },
  });
  const methods = async (auth: object, email: object = {}) =>
    setup(defineCms({ ...base, ...email, auth })).client.request("/auth-status");
  const linkIn = (message: { text?: string }) => message.text!.match(/https?:\/\/\S+/)![0];
  const codeIn = (message: { text?: string }) => message.text!.match(/\b\d{6}\b/)![0];

  it("reports which methods are on", async () => {
    const none = { password: true, passkeys: false, magicLink: false, emailOtp: false };
    expect(await client.request("/auth-status")).toMatchObject(none);
    const email = { plugins: [magicLink(), emailOTP()] };
    expect(await methods(email)).toMatchObject(none);
    expect(await methods(email, withEmail([]))).toMatchObject({ magicLink: true, emailOtp: true });
    const own = { plugins: [magicLink({ sendMagicLink: () => {} })] };
    expect(await methods(own)).toMatchObject({ magicLink: true, emailOtp: false });
    expect(await methods({ ...passwordOff, plugins: [passkey()] })).toMatchObject({
      password: false,
      passkeys: true,
    });
  });

  it("remembers the last sign-in method in a cookie the admin can read", async () => {
    const { cms, fetch } = setup();
    await cms.users.create(admin);
    const res = await post(fetch, "/auth/sign-in/email", admin);
    const cookie = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.last_used_login_method="));
    expect(cookie).toMatch(/=email;/);
    expect(cookie).not.toMatch(/HttpOnly/i);
  });

  it("reports the length of an email code", async () => {
    expect(await methods({ plugins: [emailOTP()] }, withEmail([]))).toMatchObject({
      emailOtpLength: 6,
    });
    expect(await methods({ plugins: [emailOTP({ otpLength: 8 })] }, withEmail([]))).toMatchObject({
      emailOtpLength: 8,
    });
  });

  it("refuses password sign-in and sign-up when password is off", async () => {
    const { cms, client } = setup(
      defineCms({ ...base, auth: { ...passwordOff, plugins: [passkey()] } }),
    );
    expect(await status(client.signUp(admin))).toBe(400);
    await cms.users.create({ ...admin, role: "admin" });
    expect(await status(client.signIn(admin))).toBe(400);
  });

  it("sets up the first admin without a password", async () => {
    const cms = defineCms({ ...base, auth: { ...passwordOff, plugins: [passkey()] } });
    const { client, fetch } = setup(cms);
    const text = await fetch(`${origin}/_tenon/setup`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ name: "Admin", email: admin.email }),
    });
    expect(text.status).toBe(415);
    expect(await client.setup({ name: "Admin", email: admin.email })).toMatchObject({
      email: admin.email,
      role: "admin",
    });
    expect(await client.getSession()).toMatchObject({
      user: { email: admin.email, role: "admin" },
    });
    expect(await status(setup(cms).client.setup({ name: "C", email: "c@d.co" }))).toBe(409);
  });

  it("offers setup only while password sign-in is off", async () => {
    expect(await status(client.setup({ name: "Admin", email: admin.email }))).toBe(404);
  });

  it("creates one admin when setup requests race", async () => {
    const cms = defineCms({ ...base, auth: { ...passwordOff, plugins: [passkey()] } });
    const results = await Promise.all(
      ["a@b.co", "c@d.co"].map((email) => post(setup(cms).fetch, "/setup", { name: "A", email })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const { adapter } = await (await cms.auth()).$context;
    expect(await adapter.count({ model: "user" })).toBe(1);
  });

  it("refuses to start without a sign-in method", () => {
    expect(() => defineCms({ ...base, auth: passwordOff })).toThrow(/sign-in method/);
    // An email method without email still starts: `tenon users recover` signs in then.
    expect(() =>
      defineCms({ ...base, auth: { ...passwordOff, plugins: [magicLink()] } }),
    ).not.toThrow();
  });

  it("emails a magic link that signs in", async () => {
    const sent: Sent = [];
    const cms = defineCms({
      ...base,
      ...withEmail(sent),
      auth: { ...base.auth, plugins: [magicLink()] },
    });
    await setup(cms).client.signUp(admin);
    const guest = setup(cms);
    await post(guest.fetch, "/auth/sign-in/magic-link", {
      email: admin.email,
      callbackURL: "/admin/",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(admin.email);

    const res = await guest.fetch(linkIn(sent[0]), { redirect: "manual" });
    expect(res.headers.get("location")).toMatch(/\/admin\/$/);
    expect(await guest.client.getSession()).toMatchObject({ user: { email: admin.email } });
  });

  it("creates no user from a magic link", async () => {
    const sent: Sent = [];
    const urls: string[] = [];
    const ownSender = magicLink({ sendMagicLink: ({ url }) => void urls.push(url) });
    for (const plugin of [magicLink(), ownSender]) {
      const cms = defineCms({
        ...base,
        ...withEmail(sent),
        auth: { ...base.auth, plugins: [plugin] },
      });
      const guest = setup(cms);
      const res = await post(guest.fetch, "/auth/sign-in/magic-link", { email: "new@b.co" });
      expect(res.status).toBe(200);
      if (urls.length) await guest.fetch(urls[0], { redirect: "manual" });
      const auth = await (await cms.auth()).$context;
      expect(await auth.internalAdapter.findUserByEmail("new@b.co")).toBeNull();
    }
    expect(sent).toHaveLength(0);
    expect(urls).toHaveLength(1);
  });

  it("emails a code that signs in once it is right", async () => {
    const sent: Sent = [];
    const cms = defineCms({
      ...base,
      ...withEmail(sent),
      auth: { ...base.auth, plugins: [emailOTP()] },
    });
    await setup(cms).client.signUp(admin);
    const guest = setup(cms);
    const email = admin.email;
    await post(guest.fetch, "/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
    expect(sent[0]).toMatchObject({ to: email, subject: "Your sign-in code" });
    const otp = codeIn(sent[0]);

    const wrong = otp === "000000" ? "111111" : "000000";
    expect((await post(guest.fetch, "/auth/sign-in/email-otp", { email, otp: wrong })).status).toBe(
      400,
    );
    expect(await guest.client.getSession()).toBeNull();
    expect((await post(guest.fetch, "/auth/sign-in/email-otp", { email, otp })).status).toBe(200);
    expect(await guest.client.getSession()).toMatchObject({ user: { email } });
  });

  it("keeps the last passkey while it is the only way to sign in", async () => {
    async function env(auth: object, email: object = {}) {
      const cms = defineCms({ ...base, ...email, auth });
      const { id } = await cms.users.create({ ...admin, password: undefined, role: "admin" });
      const user = setup(cms);
      await user.fetch((await cms.users.signInLink(admin.email, { origin })).link);
      const { adapter } = await (await cms.auth()).$context;
      const add = async () => {
        const data = { publicKey: "k", userId: id, credentialID: crypto.randomUUID(), counter: 0 };
        const row = await adapter.create<{ id: string }>({
          model: "passkey",
          data: { ...data, deviceType: "singleDevice", backedUp: false },
        });
        return () => post(user.fetch, "/auth/passkey/delete-passkey", { id: row.id });
      };
      return { add };
    }

    const off = await env({ ...passwordOff, plugins: [passkey()] });
    const [first, second] = [await off.add(), await off.add()];
    expect((await first()).status).toBe(200);
    const last = await second();
    expect(last.status).toBe(400);
    expect(await last.json()).toMatchObject({
      message: expect.stringMatching(/only way to sign in/),
    });

    const withLink = await env(
      { ...passwordOff, plugins: [passkey(), magicLink()] },
      withEmail([]),
    );
    expect((await (await withLink.add())()).status).toBe(200);
    const withPassword = await env({ ...base.auth, plugins: [passkey()] });
    expect((await (await withPassword.add())()).status).toBe(200);
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

describe("device login", () => {
  it("gives a CLI a session once a signed-in user approves its code", async () => {
    const env = await withAdmin();
    const cli = setup(env.cms);

    const code = await cli.client.device.code();
    expect(code.verification_uri_complete).toBe(
      `${origin}/admin/device?user_code=${code.user_code}`,
    );
    await env.client.device.verify(code.user_code);
    await env.client.device.approve(code.user_code);
    const { access_token } = await cli.client.device.token(code.device_code);

    const bearer = setup(env.cms).client;
    const res = await env.cms.fetch(
      new Request(`${origin}/_tenon/auth/get-session`, {
        headers: { authorization: `Bearer ${access_token}` },
      }),
    );
    expect((await res.json()).user.email).toBe(admin.email);
    expect(await bearer.getSession()).toBeNull();
    const schema = await env.cms.fetch(
      new Request(`${origin}/_tenon/schema`, {
        headers: { authorization: `Bearer ${access_token}` },
      }),
    );
    expect(schema.status).toBe(200);
  });

  it("refuses a code nobody approved", async () => {
    const env = await withAdmin();
    const code = await setup(env.cms).client.device.code();
    await env.client.device.verify(code.user_code);
    await env.client.device.deny(code.user_code);

    await expect(setup(env.cms).client.device.token(code.device_code)).rejects.toMatchObject({
      status: 400,
      body: { error: "access_denied" },
    });
  });
});

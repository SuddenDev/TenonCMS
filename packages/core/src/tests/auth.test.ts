import { createAuthMiddleware } from "better-auth/api";
import { admin as adminPlugin, anonymous, twoFactor } from "better-auth/plugins";
import { beforeEach, describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { admin, base, fresh, origin, setup, status, tables, tmpDb, type Env } from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("database", () => {
  it("creates CMS and auth tables on first access", async () => {
    const url = tmpDb();
    const cms = defineCms({
      collections: { posts: { fields: {} } },
      database: { url },
      secret: "x".repeat(32),
    });
    await cms.find("posts");
    await cms.auth();
    expect(await tables(url)).toEqual(
      expect.arrayContaining([
        "cms_documents",
        "cms_globals",
        "user",
        "session",
        "account",
        "verification",
      ]),
    );
  });
});

describe("auth", () => {
  it("lets only the first user sign up", async () => {
    await client.signUp(admin);
    expect(await client.getSession()).toMatchObject({ user: { email: admin.email } });
    expect(await status(client.signUp({ ...admin, email: "c@d.co" }))).toBe(403);
  });

  it("creates plugin tables at runtime and types plugin endpoints", async () => {
    const url = tmpDb();
    const cms = defineCms({ ...base, database: { url }, auth: { plugins: [twoFactor()] } });
    const auth = await cms.auth();
    expect(typeof auth.api.enableTwoFactor).toBe("function");
    expect(await tables(url)).toContain("twoFactor");
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
    const res = await fetch(`${origin}/api/cms/auth/admin/create-user`, {
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
      new Request(`${origin}/api/cms/auth/sign-in/anonymous`, {
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

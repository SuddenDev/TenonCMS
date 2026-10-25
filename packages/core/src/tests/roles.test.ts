import { admin as adminPlugin } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { defineCms, type Schema } from "../index.ts";
import { admin, base, origin, setup } from "./setup.ts";

const send = async () => {};
const editor = { name: "Ed", email: "e@b.co", password: "password123" };

type Fetch = ReturnType<typeof setup>["fetch"];
const post = (fetch: Fetch, path: string, body: unknown) =>
  fetch(`${origin}/api/cms${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** An instance with a signed-in admin, and a helper that creates a user as that admin. */
async function withAdmin<C extends { schema: Schema; fetch(request: Request): Promise<Response> }>(
  cms: C = defineCms(base) as never,
) {
  const env = setup(cms);
  await env.client.signUp(admin);
  const create = async (user: object) => {
    const res = await post(env.fetch, "/auth/admin/create-user", user);
    return ((await res.json()) as { user: { id: string; role: string } }).user;
  };
  const me = (await env.client.getSession()) as unknown as { user: { id: string; role: string } };
  return { ...env, cms, create, me: me.user };
}

describe("roles of users", () => {
  it("makes the first user an admin and later users editors", async () => {
    const { me, create } = await withAdmin();
    expect(me.role).toBe("admin");
    expect((await create(editor)).role).toBe("editor");
  });

  it("lets only admins create users", async () => {
    const { cms, create } = await withAdmin();
    await create(editor);
    const ed = setup(cms);
    await ed.client.signIn(editor);
    const user = { name: "X", email: "x@b.co", password: "password123" };
    expect((await post(ed.fetch, "/auth/admin/create-user", user)).status).toBe(403);
    expect((await post(ed.fetch, "/auth/sign-up/email", user)).status).toBe(403);
  });

  it("checks the password length when an admin creates a user", async () => {
    const { fetch } = await withAdmin();
    const res = await post(fetch, "/auth/admin/create-user", { ...editor, password: "short" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ message: "Password MUST be at least 8 characters" });
  });

  it("refuses to demote the last admin", async () => {
    const { fetch, me, create } = await withAdmin();
    const demote = { userId: me.id, role: "editor" };
    expect((await post(fetch, "/auth/admin/set-role", demote)).status).toBe(409);
    await create({ ...editor, role: "admin" });
    expect((await post(fetch, "/auth/admin/set-role", demote)).status).toBe(200);
  });

  it("does not count a deactivated admin", async () => {
    const { cms, me, create } = await withAdmin();
    const other = await create({ ...editor, role: "admin" });
    const second = setup(cms);
    await second.client.signIn(editor);
    expect((await post(second.fetch, "/auth/admin/ban-user", { userId: me.id })).status).toBe(200);
    const demote = { userId: other.id, role: "editor" };
    expect((await post(second.fetch, "/auth/admin/set-role", demote)).status).toBe(409);
  });

  it("does not let admins impersonate", async () => {
    const { fetch, create } = await withAdmin();
    const ed = await create(editor);
    expect((await post(fetch, "/auth/admin/impersonate-user", { userId: ed.id })).status).toBe(403);
  });

  it("gives hooks the role of the user", async () => {
    const roles: unknown[] = [];
    const cms = defineCms({
      ...base,
      collections: {
        posts: {
          fields: { title: { type: "text" } },
          hooks: {
            beforeChange: [({ user }) => void roles.push(user?.role)],
          },
        },
      },
    });
    const { client } = await withAdmin(cms);
    await client.create("posts", { title: "Hi" });
    expect(roles).toEqual(["admin"]);
  });

  it("uses the host's admin plugin instead of core's", async () => {
    const { create } = await withAdmin(
      defineCms({ ...base, auth: { plugins: [adminPlugin({ defaultRole: "admin" })] } }),
    );
    expect((await create(editor)).role).toBe("admin");
  });
});

describe("roles in /schema", () => {
  it("lists the built-in roles and the host's", async () => {
    const { client } = setup(
      defineCms({ ...base, roles: { author: { label: { en: "Author", de: "Autor" } } } }),
    );
    await client.signUp(admin);
    const schema = await client.request<{ roles: { name: string }[] }>("/schema");
    expect(schema.roles.map((r) => r.name)).toEqual(["admin", "editor", "author"]);
    expect(schema.roles[2]).toEqual({ name: "author", label: { en: "Author", de: "Autor" } });
  });

  it("says whether email is configured", async () => {
    const without = setup();
    await without.client.signUp(admin);
    expect(await without.client.request("/schema")).toMatchObject({ email: false });

    const withEmail = setup(
      defineCms({ ...base, email: { from: "cms@example.com", adapter: { send } } }),
    );
    await withEmail.client.signUp(admin);
    expect(await withEmail.client.request("/schema")).toMatchObject({ email: true });
  });

  it("rejects a host role named like a built-in one at startup", () => {
    expect(() => defineCms({ ...base, roles: { admin: {} } })).toThrow('role "admin" is built in');
  });
});

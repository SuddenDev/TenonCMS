import { admin as adminPlugin } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { admin, base, post, setup, withAdmin } from "./setup.ts";

const send = async () => {};
const editor = { name: "Ed", email: "e@b.co", password: "password123" };

describe("roles of users", () => {
  it("makes the first user an admin and later users editors, checks the password, never impersonates", async () => {
    const { fetch, me, create } = await withAdmin();
    expect(me.role).toBe("admin");
    const ed = await create(editor);
    expect(ed.role).toBe("editor");
    expect((await post(fetch, "/auth/admin/impersonate-user", { userId: ed.id })).status).toBe(403);
    const res = await post(fetch, "/auth/admin/create-user", { ...editor, password: "short" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ message: "Password MUST be at least 8 characters" });
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
  it("lists the built-in roles and the host's, and says whether email is configured", async () => {
    const { client } = setup(
      defineCms({ ...base, roles: { author: { label: { en: "Author", de: "Autor" } } } }),
    );
    await client.signUp(admin);
    const schema = await client.request<{ roles: { name: string }[] }>("/schema");
    expect(schema.roles.map((r) => r.name)).toEqual(["admin", "editor", "author"]);
    expect(schema.roles[2]).toEqual({ name: "author", label: { en: "Author", de: "Autor" } });
    expect(schema).toMatchObject({ email: false });

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

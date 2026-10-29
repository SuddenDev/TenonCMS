// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { client, type Session } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { nextTick } from "vue";
import { cleanup, fill, render, submit } from "@/modules/auth/components/render";

const roles = [
  { name: "admin", label: { en: "Admin" } },
  { name: "editor", label: { en: "Editor" } },
];
const invite = {
  id: "i1",
  email: "new@b.co",
  role: "editor",
  invitedBy: "u1",
  expiresAt: "2026-10-31T00:00:00.000Z",
  createdAt: "2026-10-24T00:00:00.000Z",
  expired: false,
};

function signIn(role: string) {
  const user = {
    id: "u1",
    name: "Ada",
    email: "ada@b.co",
    role,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
  vi.spyOn(client, "getSession").mockResolvedValue({ user } as unknown as Session);
  vi.spyOn(client, "getSchema").mockResolvedValue({
    collections: {},
    globals: {},
    roles,
    email: false,
  } as never);
  vi.spyOn(client.preview, "enter").mockResolvedValue();
  vi.spyOn(client.invites, "list").mockResolvedValue([invite]);
  vi.spyOn(client, "request").mockImplementation(async (path: string) =>
    path === "/auth/admin/list-users" ? { users: [user], total: 1 } : {},
  );
}

beforeEach(() => {
  i18n.global.locale.value = "en";
  document.cookie = "tenon-preview=drafts";
});
afterEach(cleanup);

it("shows users and invites to an admin", async () => {
  signIn("admin");
  const { root } = await render("/users");
  await vi.waitFor(() => expect(root.textContent).toContain("new@b.co"));
  expect(root.textContent).toContain("ada@b.co");
  expect(root.textContent).toContain("Invited");
  expect(root.querySelector('a[href="/cms/users"]')).not.toBeNull();
});

it("hides the Users screen from other roles", async () => {
  signIn("editor");
  const { router, root } = await render("/users");
  await vi.waitFor(() => expect(router.currentRoute.value.path).not.toBe("/users"));
  expect(root.querySelector('a[href="/cms/users"]')).toBeNull();
  expect(client.invites.list).not.toHaveBeenCalled();
});

const result = {
  invite: { ...invite, id: "i2", email: "ed@b.co", role: "editor" },
  link: "http://localhost:3000/cms/invite?token=t",
  sent: false,
};

it("opens a user in a pane with the role as a dropdown", async () => {
  signIn("admin");
  const { root } = await render("/users/u1");
  await vi.waitFor(() => expect(root.querySelector("select#user-role")).not.toBeNull());
  const select = root.querySelector<HTMLSelectElement>("select#user-role")!;
  expect(select.value).toBe("admin");
  expect([...select.options].map((o) => o.value)).toEqual(["admin", "editor"]);
});

it("invites without email and shows the link to copy", async () => {
  signIn("admin");
  const create = vi.spyOn(client.invites, "create").mockResolvedValue(result);
  const { root, router } = await render("/users/new");
  await vi.waitFor(() => expect(root.querySelector("#new-user-email")).not.toBeNull());
  await fill(root, "#new-user-email", "ed@b.co");
  submit(root);
  await vi.waitFor(() =>
    expect(create).toHaveBeenCalledWith({
      email: "ed@b.co",
      role: "editor",
      url: `${location.origin}/cms/invite`,
    }),
  );
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/users/invites/i2"));
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>("input[readonly]")?.value).toBe(result.link),
  );
});

it("creates a user with a generated password", async () => {
  signIn("admin");
  const request = vi.mocked(client.request);
  const { root, router } = await render("/users/new");
  await vi.waitFor(() => expect(root.textContent).toContain("Set password"));
  const tab = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
    b.textContent?.includes("Set password"),
  )!;
  tab.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
  tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  await vi.waitFor(() => expect(root.querySelector("#new-user-name")).not.toBeNull());
  await fill(root, "#new-user-email", "ed@b.co");
  await fill(root, "#new-user-name", "Ed");
  root.querySelector<HTMLButtonElement>('[aria-label="Generate a random password"]')!.click();
  await nextTick();
  const password = root.querySelector<HTMLInputElement>("#new-user-password")!;
  expect(password.type).toBe("text");
  expect(password.value).toHaveLength(20);
  request.mockImplementation(async (path: string) =>
    path === "/auth/admin/create-user"
      ? { user: { id: "u2", name: "Ed" } }
      : path === "/auth/admin/list-users"
        ? { users: [], total: 0 }
        : {},
  );
  submit(root);
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith("/auth/admin/create-user", {
      method: "POST",
      body: { email: "ed@b.co", name: "Ed", password: password.value, role: "editor" },
    }),
  );
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/users/u2"));
});

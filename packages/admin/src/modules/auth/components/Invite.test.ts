// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { client, CmsError, type Session } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { cleanup, fill, render, submit } from "./render";

beforeEach(() => {
  i18n.global.locale.value = "en";
  vi.spyOn(client, "getSession").mockResolvedValue(null);
  vi.spyOn(client, "getSchema").mockRejectedValue(new CmsError(401, {}));
  vi.spyOn(client, "request").mockResolvedValue({ setup: false, signUp: false });
});
afterEach(cleanup);

it("shows the invite and creates the account", async () => {
  vi.spyOn(client.invites, "check").mockResolvedValue({
    email: "ed@b.co",
    role: "editor",
    label: { en: "Editor", de: "Redakteur" },
  });
  const accept = vi.spyOn(client.invites, "accept").mockImplementation(async () => {
    vi.mocked(client.getSession).mockResolvedValue({
      user: { id: "u2", name: "Ed", email: "ed@b.co", role: "editor" },
    } as unknown as Session);
    return { user: {} as Session["user"] };
  });
  vi.spyOn(client.preview, "enter").mockResolvedValue();
  const { root, router } = await render("/invite?token=abc");
  await vi.waitFor(() => expect(root.textContent).toContain("You were invited as Editor."));
  expect(root.querySelector<HTMLInputElement>('input[type="email"]')!.value).toBe("ed@b.co");
  expect(client.invites.check).toHaveBeenCalledWith("abc");

  await fill(root, 'input[name="name"]', "Ed");
  await fill(root, 'input[name="password"]', "password123");
  submit(root);
  await vi.waitFor(() =>
    expect(accept).toHaveBeenCalledWith({ token: "abc", name: "Ed", password: "password123" }),
  );
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
});

it("says when the invite is no longer valid", async () => {
  vi.spyOn(client.invites, "check").mockRejectedValue(new CmsError(404, { message: "Not Found" }));
  const { root } = await render("/invite?token=old");
  await vi.waitFor(() => expect(root.textContent).toContain("This invitation is no longer valid."));
  expect(root.querySelector("form")).toBeNull();
  expect(root.querySelector('a[href="/cms/login"]')).not.toBeNull();
});

it("treats a link without a token as invalid", async () => {
  const check = vi.spyOn(client.invites, "check");
  const { root } = await render("/invite");
  await vi.waitFor(() => expect(root.textContent).toContain("This invitation is no longer valid."));
  expect(check).not.toHaveBeenCalled();
});

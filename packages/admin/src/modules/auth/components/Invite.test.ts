// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { client, CmsError, type Session } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { addPasskey, passkeysSupported } from "../passkey";
import { cleanup, fill, render, submit } from "./render";

vi.mock("../passkey", async (original) => ({
  ...(await original<typeof import("../passkey")>()),
  addPasskey: vi.fn(),
  passkeysSupported: vi.fn(),
}));

const status = {
  setup: false,
  signUp: false,
  password: true,
  passkeys: false,
  magicLink: false,
  emailOtp: false,
};

beforeEach(() => {
  i18n.global.locale.value = "en";
  vi.spyOn(client, "getSession").mockResolvedValue(null);
  vi.spyOn(client, "getSchema").mockRejectedValue(new CmsError(401, {}));
  vi.spyOn(client, "request").mockResolvedValue(status);
  vi.mocked(addPasskey).mockReset().mockResolvedValue();
  vi.mocked(passkeysSupported).mockReturnValue(true);
});
afterEach(cleanup);

const buttonWith = (root: Element, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

function invited() {
  vi.spyOn(client.invites, "check").mockResolvedValue({
    email: "ed@b.co",
    role: "editor",
    label: { en: "Editor", de: "Redakteur" },
  });
  vi.spyOn(client.preview, "enter").mockResolvedValue();
  return vi.spyOn(client.invites, "accept").mockImplementation(async () => {
    vi.mocked(client.getSession).mockResolvedValue({
      user: { id: "u2", name: "Ed", email: "ed@b.co", role: "editor" },
    } as unknown as Session);
    return { user: {} as Session["user"] };
  });
}

it("shows the invite and creates the account", async () => {
  const accept = invited();
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

it("accepts without a password while password sign-in is off", async () => {
  vi.mocked(client.request).mockResolvedValue({ ...status, password: false });
  const accept = invited();
  const { root, router } = await render("/invite?token=abc");
  await vi.waitFor(() => expect(root.querySelector('input[name="name"]')).not.toBeNull());
  expect(root.querySelector('input[name="password"]')).toBeNull();

  await fill(root, 'input[name="name"]', "Ed");
  submit(root);
  await vi.waitFor(() => expect(accept).toHaveBeenCalledWith({ token: "abc", name: "Ed" }));
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
});

it("asks for a passkey after accepting when passkeys replace the password", async () => {
  vi.mocked(client.request).mockResolvedValue({ ...status, password: false, passkeys: true });
  invited();
  const { root, router } = await render("/invite?token=abc");
  await vi.waitFor(() => expect(root.querySelector('input[name="name"]')).not.toBeNull());
  await fill(root, 'input[name="name"]', "Ed");
  submit(root);
  await vi.waitFor(() => expect(root.textContent).toContain("Create a passkey"));
  expect(router.currentRoute.value.path).toBe("/invite");
  expect(buttonWith(root, "Set a password")).toBeUndefined();

  submit(root);
  await vi.waitFor(() => expect(addPasskey).toHaveBeenCalled());
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
});

it("accepts without a password next to passkeys, then offers to set one", async () => {
  vi.mocked(client.request).mockResolvedValue({ ...status, passkeys: true });
  const accept = invited();
  const { root, router } = await render("/invite?token=abc");
  await vi.waitFor(() => expect(root.querySelector('input[name="name"]')).not.toBeNull());
  expect(root.querySelector('input[type="password"]')).toBeNull();
  await fill(root, 'input[name="name"]', "Ed");
  submit(root);
  await vi.waitFor(() => expect(accept).toHaveBeenCalledWith({ token: "abc", name: "Ed" }));

  await vi.waitFor(() => expect(buttonWith(root, "Set a password")).toBeDefined());
  expect(buttonWith(root, "by email")).toBeUndefined();
  buttonWith(root, "Set a password")!.click();
  await vi.waitFor(() => expect(root.querySelector('input[type="password"]')).not.toBeNull());
  await fill(root, 'input[type="password"]', "password123");
  submit(root);
  await vi.waitFor(() =>
    expect(client.request).toHaveBeenCalledWith("/account/password", {
      method: "POST",
      body: { newPassword: "password123" },
    }),
  );
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
  expect(addPasskey).not.toHaveBeenCalled();
});

it("lets the user sign in by email instead", async () => {
  vi.mocked(client.request).mockResolvedValue({ ...status, emailOtp: true });
  invited();
  const { root, router } = await render("/invite?token=abc");
  await vi.waitFor(() => expect(root.querySelector('input[name="name"]')).not.toBeNull());
  await fill(root, 'input[name="name"]', "Ed");
  submit(root);
  await vi.waitFor(() => expect(buttonWith(root, "by email")).toBeDefined());
  buttonWith(root, "by email")!.click();
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

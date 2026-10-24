// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { client, CmsError } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { cleanup, fill, render, submit } from "./render";

const user = { id: "admin", name: "Admin", email: "admin@example.com" };
let status = { setup: false, signUp: false };

beforeEach(() => {
  i18n.global.locale.value = "en";
  status = { setup: false, signUp: false };
  vi.spyOn(client, "getSession").mockResolvedValue(null);
  vi.spyOn(client, "getSchema").mockRejectedValue(new CmsError(401, {}));
  vi.spyOn(client.preview, "enter").mockResolvedValue();
  vi.spyOn(client, "request").mockImplementation(async (path: string) => {
    if (path === "/auth-status") return status;
    throw new CmsError(404, {});
  });
});
afterEach(cleanup);

it("sends a visitor to the sign-in and back to the page after it", async () => {
  const { router, root } = await render("/content/settings");
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"));
  expect(router.currentRoute.value.query.redirect).toBe("/content/settings");
  const signIn = vi.spyOn(client, "signIn").mockImplementation(async () => {
    vi.mocked(client.getSession).mockResolvedValue({ user } as never);
    return user as never;
  });
  await vi.waitFor(() => expect(root.querySelector('input[type="email"]')).not.toBeNull());
  await fill(root, 'input[type="email"]', user.email);
  await fill(root, 'input[type="password"]', "password123");
  submit(root);
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content/settings"));
  expect(signIn).toHaveBeenCalledWith({ email: user.email, password: "password123" });
});

it("sends a signed-in admin away from the sign-in", async () => {
  vi.mocked(client.getSession).mockResolvedValue({ user } as never);
  const { router } = await render("/login");
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
});

it("shows the first-admin setup when no user exists", async () => {
  status = { setup: true, signUp: true };
  const { router, root } = await render("/login");
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/signup"));
  await vi.waitFor(() => expect(root.textContent).toContain("Create the first admin"));
  expect(root.querySelector('a[href="/cms/login"]')).toBeNull();
  const signUp = vi.spyOn(client, "signUp").mockResolvedValue(user as never);
  await fill(root, "#name", "Admin");
  await fill(root, 'input[type="email"]', user.email);
  await fill(root, 'input[type="password"]', "password123");
  submit(root);
  await vi.waitFor(() =>
    expect(signUp).toHaveBeenCalledWith({
      name: "Admin",
      email: user.email,
      password: "password123",
    }),
  );
});

it("hides sign-up while it is closed", async () => {
  const { router, root } = await render("/signup");
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"));
  await vi.waitFor(() => expect(root.querySelector('input[type="email"]')).not.toBeNull());
  expect(root.querySelector('a[href="/cms/signup"]')).toBeNull();
});

it("links to sign-up while it is open", async () => {
  status = { setup: false, signUp: true };
  const { root } = await render("/login");
  await vi.waitFor(() => expect(root.querySelector('a[href="/cms/signup"]')).not.toBeNull());
});

it("toggles the password's visibility", async () => {
  const { root } = await render("/login");
  await vi.waitFor(() => expect(root.querySelector('input[type="password"]')).not.toBeNull());
  root.querySelector<HTMLButtonElement>('button[aria-label="Show password"]')!.click();
  await vi.waitFor(() =>
    expect(root.querySelector("#password")?.getAttribute("type")).toBe("text"),
  );
});

it("shows the met criteria of a new password", async () => {
  status = { setup: true, signUp: true };
  const { root } = await render("/signup");
  await vi.waitFor(() => expect(root.querySelector('input[type="password"]')).not.toBeNull());
  expect(root.textContent).not.toContain("At least 8 characters");
  await fill(root, 'input[type="password"]', "abcdefgh");
  const met = [...root.querySelectorAll('li[data-met="true"]')].map((li) => li.textContent?.trim());
  expect(met).toEqual(["At least 8 characters", "A lowercase letter"]);
});

// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { client, CmsError } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { cleanup, fill as fillIn, render as renderAdmin, submit as submitForm } from "./render";

let root: HTMLElement;
beforeEach(() => {
  i18n.global.locale.value = "en";
  vi.spyOn(client, "getSession").mockResolvedValue(null);
  vi.spyOn(client, "getSchema").mockRejectedValue(new CmsError(401, {}));
  vi.spyOn(client, "request").mockResolvedValue({ setup: false, signUp: false });
});
afterEach(cleanup);

async function render(path: string) {
  const result = await renderAdmin(path);
  root = result.root;
  return result.router;
}

const fill = (selector: string, value: string) => fillIn(root, selector, value);
const submit = () => submitForm(root);

it("links from sign-in to password recovery under a custom admin path", async () => {
  const router = await render("/content");
  await vi.waitFor(() =>
    expect(root.querySelector('a[href="/cms/forgot-password"]')).not.toBeNull(),
  );
  root.querySelector<HTMLAnchorElement>('a[href="/cms/forgot-password"]')!.click();
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/forgot-password"));
  expect(root.querySelector('input[type="email"]')).not.toBeNull();
  expect(root.querySelector('input[type="password"]')).toBeNull();
});

it("requests a link with the correct callback URL and shows a generic confirmation", async () => {
  const request = vi.spyOn(client, "requestPasswordReset").mockResolvedValue();
  await render("/forgot-password");
  await fill('input[type="email"]', "admin@example.com");
  submit();
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledExactlyOnceWith({
      email: "admin@example.com",
      redirectTo: `${location.origin}/cms/reset-password`,
    }),
  );
  await vi.waitFor(() =>
    expect(root.querySelector('[role="status"]')?.textContent).toContain("If an account exists"),
  );
  expect(root.querySelector('input[type="email"]')).toBeNull();
});

it("keeps a failed request available to retry and explains missing email configuration", async () => {
  vi.spyOn(client, "requestPasswordReset").mockRejectedValue(
    new CmsError(400, {
      code: "RESET_PASSWORD_DISABLED",
      message: "Reset password isn't enabled",
    }),
  );
  await render("/forgot-password");
  await fill('input[type="email"]', "admin@example.com");
  submit();
  await vi.waitFor(() =>
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("not configured"),
  );
  expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
});

it("prevents duplicate requests while sending", async () => {
  let finish!: () => void;
  const request = vi.spyOn(client, "requestPasswordReset").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await render("/forgot-password");
  await fill('input[type="email"]', "admin@example.com");
  submit();
  submit();
  await nextTick();
  expect(request).toHaveBeenCalledOnce();
  expect(root.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(true);
  finish();
  await nextTick();
});

it("validates confirmation, resets the password and removes the token from the URL", async () => {
  const reset = vi.spyOn(client, "resetPassword").mockResolvedValue();
  const router = await render("/reset-password?token=valid-token");
  await fill('input[autocomplete="new-password"]', "a-new-password");
  await fill('input[name="confirmPassword"]', "different-password");
  submit();
  await nextTick();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain("Passwords do not match");
  expect(reset).not.toHaveBeenCalled();
  await fill('input[name="confirmPassword"]', "a-new-password");
  submit();
  await vi.waitFor(() =>
    expect(reset).toHaveBeenCalledExactlyOnceWith({
      token: "valid-token",
      newPassword: "a-new-password",
    }),
  );
  await vi.waitFor(() =>
    expect(root.querySelector('[role="status"]')?.textContent).toContain("password has been reset"),
  );
  expect(router.currentRoute.value.query.token).toBeUndefined();
  expect(root.querySelector('input[type="password"]')).toBeNull();
  expect(root.querySelector('a[href="/cms/login"]')).not.toBeNull();
});

it.each([
  "/reset-password",
  "/reset-password?error=INVALID_TOKEN",
  "/reset-password?token=a&token=b",
])("handles an invalid reset link: %s", async (path) => {
  await render(path);
  expect(root.querySelector('[role="alert"]')?.textContent).toContain("invalid or has expired");
  expect(root.querySelector('input[type="password"]')).toBeNull();
  expect(root.querySelector('a[href="/cms/forgot-password"]')).not.toBeNull();
});

it("handles a token that expires after the page opens", async () => {
  vi.spyOn(client, "resetPassword").mockRejectedValue(
    new CmsError(400, { code: "INVALID_TOKEN", message: "Invalid token" }),
  );
  await render("/reset-password?token=expired-token");
  await fill('input[autocomplete="new-password"]', "a-new-password");
  await fill('input[name="confirmPassword"]', "a-new-password");
  submit();
  await vi.waitFor(() =>
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("invalid or has expired"),
  );
  expect(root.querySelector('a[href="/cms/forgot-password"]')).not.toBeNull();
});

it("shows password recovery even when a session is already present", async () => {
  vi.mocked(client.getSession).mockResolvedValue({
    user: { id: "admin", email: "admin@example.com" },
  } as never);
  vi.spyOn(client.preview, "enter").mockResolvedValue();
  await render("/reset-password?token=valid-token");
  await nextTick();
  expect(root.querySelector('input[autocomplete="new-password"]')).not.toBeNull();
});

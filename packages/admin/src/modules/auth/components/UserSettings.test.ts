// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import { client, CmsError, type Session } from "@/shared/api";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { i18n, useAdminLocale } from "@/shared/i18n";
import { sessionKey } from "@/shared/options";
import { cleanup as cleanupAdmin, render } from "./render";
import UserSettings from "./UserSettings.vue";

let app: App | undefined;
let accounts = [{ providerId: "credential" }];
const user = ref<Session["user"] | null>(null);
const request = vi.fn();

beforeEach(() => {
  useAdminLocale().locale.value = "en";
  useTimeZone().preferred.value = null;
  accounts = [{ providerId: "credential" }];
  user.value = { id: "u", name: "Admin", email: "admin@example.com" } as Session["user"];
  request
    .mockReset()
    .mockImplementation(async (path: string) => (path === "/auth/list-accounts" ? accounts : {}));
  vi.spyOn(client, "request").mockImplementation(request);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  cleanupAdmin();
  document.body.innerHTML = "";
});

async function open() {
  const root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(UserSettings, { open: true }) })
    .use(i18n)
    .provide(sessionKey, { user, load: async () => {}, signOut: async () => {}, expire: () => {} });
  app.mount(root);
  await vi.waitFor(() => expect(document.querySelector("#account-name")).not.toBeNull());
}

async function fill(selector: string, value: string, event = "input") {
  const el = document.querySelector<HTMLInputElement>(selector)!;
  el.value = value;
  el.dispatchEvent(new Event(event, { bubbles: true }));
  await nextTick();
}

const submit = (form: Element) =>
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

it("saves the name and preferences and applies them", async () => {
  await open();
  await fill("#account-name", "New name");
  await fill("#account-language", "de", "change");
  submit(document.querySelector("#account-name")!.closest("form")!);
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith("/auth/update-user", {
      method: "POST",
      body: { name: "New name", language: "de", timezone: null },
    }),
  );
  await vi.waitFor(() => expect(i18n.global.locale.value).toBe("de"));
  expect(user.value).toMatchObject({ name: "New name", language: "de", timezone: null });
});

it("changes an existing password", async () => {
  await open();
  (document.querySelectorAll('[role="tab"]')[1] as HTMLElement).dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true }),
  );
  await vi.waitFor(() => expect(document.querySelector("#current-password")).not.toBeNull());
  await fill("#current-password", "old-password");
  await fill("#new-password", "new-password");
  submit(document.querySelector("#new-password")!.closest("form")!);
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith("/auth/change-password", {
      method: "POST",
      body: {
        currentPassword: "old-password",
        newPassword: "new-password",
        revokeOtherSessions: true,
      },
    }),
  );
});

it("sets a first password when the user has none", async () => {
  accounts = [];
  await open();
  (document.querySelectorAll('[role="tab"]')[1] as HTMLElement).dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true }),
  );
  await vi.waitFor(() => expect(document.querySelector("#new-password")).not.toBeNull());
  expect(document.querySelector("#current-password")).toBeNull();
  await fill("#new-password", "new-password");
  submit(document.querySelector("#new-password")!.closest("form")!);
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith("/account/password", {
      method: "POST",
      body: { newPassword: "new-password" },
    }),
  );
});

it("applies the signed-in user's language and time zone", async () => {
  vi.spyOn(client, "getSession").mockResolvedValue({
    user: { ...user.value, language: "de", timezone: "Asia/Tokyo" },
  } as never);
  vi.spyOn(client, "getSchema").mockRejectedValue(new CmsError(401, {}));
  vi.spyOn(client.preview, "enter").mockResolvedValue();
  await render("/content/settings");
  await vi.waitFor(() => expect(i18n.global.locale.value).toBe("de"));
  expect(useTimeZone().timeZone.value).toBe("Asia/Tokyo");
  expect(request).not.toHaveBeenCalledWith("/auth/update-user", expect.anything());
});

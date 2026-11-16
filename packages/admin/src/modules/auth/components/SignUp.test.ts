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
  setup: true,
  signUp: true,
  password: false,
  passkeys: true,
  magicLink: false,
  emailOtp: false,
};
const signedIn = () =>
  vi.mocked(client.getSession).mockResolvedValue({
    user: { id: "u1", name: "Admin", email: "a@b.co", role: "admin" },
  } as unknown as Session);

beforeEach(() => {
  i18n.global.locale.value = "en";
  vi.spyOn(client, "getSession").mockResolvedValue(null);
  vi.spyOn(client, "getSchema").mockRejectedValue(new CmsError(401, {}));
  vi.spyOn(client.preview, "enter").mockResolvedValue();
  vi.spyOn(client, "request").mockResolvedValue(status);
  vi.mocked(addPasskey).mockReset().mockResolvedValue();
  vi.mocked(passkeysSupported).mockReturnValue(true);
});
afterEach(cleanup);

it("sets up the first admin without a password, then offers a passkey", async () => {
  const setup = vi.spyOn(client, "setup").mockImplementation(async () => {
    signedIn();
    return {} as Session["user"];
  });
  const signUp = vi.spyOn(client, "signUp");
  const { root, router } = await render("/signup");
  await vi.waitFor(() => expect(root.querySelector("#email")).not.toBeNull());
  expect(root.querySelector("#password")).toBeNull();

  await fill(root, "#name", "Admin");
  await fill(root, "#email", "a@b.co");
  submit(root);
  await vi.waitFor(() => expect(root.textContent).toContain("Create a passkey"));
  expect(setup).toHaveBeenCalledWith({ name: "Admin", email: "a@b.co" });
  expect(signUp).not.toHaveBeenCalled();
  // Without email sign-in, a passkey is the only way back in.
  expect(root.textContent).not.toContain("by email");

  submit(root);
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
  expect(addPasskey).toHaveBeenCalled();
});

it("signs up with a password while password sign-in is on", async () => {
  vi.mocked(client.request).mockResolvedValue({ ...status, password: true });
  const signUp = vi.spyOn(client, "signUp").mockImplementation(async () => {
    signedIn();
    return {} as Session["user"];
  });
  const { root, router } = await render("/signup");
  await vi.waitFor(() => expect(root.querySelector("#password")).not.toBeNull());
  await fill(root, "#name", "Admin");
  await fill(root, "#email", "a@b.co");
  await fill(root, "#password", "password123");
  submit(root);
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
  expect(signUp).toHaveBeenCalledWith({ name: "Admin", email: "a@b.co", password: "password123" });
});

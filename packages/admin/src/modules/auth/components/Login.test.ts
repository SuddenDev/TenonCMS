// @vitest-environment happy-dom
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { client, CmsError } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { cleanup, fill, render, submit } from "./render";

const user = { id: "admin", name: "Admin", email: "admin@example.com" };
const closed = {
  setup: false,
  signUp: false,
  password: true,
  passkeys: false,
  magicLink: false,
  emailOtp: false,
  emailOtpLength: 6,
};
let status = closed;

beforeEach(() => {
  i18n.global.locale.value = "en";
  status = closed;
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
  status = { ...closed, setup: true, signUp: true };
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
  status = { ...closed, signUp: true };
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
  status = { ...closed, setup: true, signUp: true };
  const { root } = await render("/signup");
  await vi.waitFor(() => expect(root.querySelector('input[type="password"]')).not.toBeNull());
  expect(root.textContent).not.toContain("At least 8 characters");
  await fill(root, 'input[type="password"]', "abcdefgh");
  const met = [...root.querySelectorAll('li[data-met="true"]')].map((li) => li.textContent?.trim());
  expect(met).toEqual(["At least 8 characters", "A lowercase letter"]);
});

const buttonWith = (root: Element, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const adminLogin = expect.stringMatching(/^https?:\/\/[^/]+\/cms\/login$/);
const emailInput = (root: Element) => root.querySelector('input[type="email"]');

async function fillCode(root: HTMLElement, code: string) {
  const slots = root.querySelectorAll<HTMLInputElement>('[data-slot="pin-input-slot"]');
  for (const [i, digit] of [...code].entries()) {
    slots[i]!.value = digit;
    slots[i]!.dispatchEvent(new InputEvent("input", { bubbles: true, data: digit }));
    await nextTick();
  }
}

describe("email sign-in", () => {
  it("hides the password and its reset link while password sign-in is off", async () => {
    status = { ...closed, password: false, magicLink: true };
    const { root } = await render("/login");
    await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
    expect(root.querySelector('input[type="password"]')).toBeNull();
    expect(root.querySelector('a[href="/cms/forgot-password"]')).toBeNull();
  });

  it("asks for the password after the email when other methods are on", async () => {
    status = { ...closed, magicLink: true, emailOtp: true };
    const signIn = vi.spyOn(client, "signIn").mockImplementation(async () => {
      vi.mocked(client.getSession).mockResolvedValue({ user } as never);
      return user as never;
    });
    const { router, root } = await render("/login");
    await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
    expect(root.querySelector('input[type="password"]')).toBeNull();
    await fill(root, 'input[type="email"]', user.email);
    submit(root);
    await vi.waitFor(() => expect(root.querySelector('input[type="password"]')).not.toBeNull());
    expect(root.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe(user.email);
    await fill(root, 'input[type="password"]', "password123");
    submit(root);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
    expect(signIn).toHaveBeenCalledWith({ email: user.email, password: "password123" });
  });

  it("offers the email methods next to the password", async () => {
    status = { ...closed, magicLink: true, emailOtp: true };
    const send = vi.spyOn(client, "sendSignInCode").mockResolvedValue();
    const { root } = await render("/login");
    await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
    await fill(root, 'input[type="email"]', user.email);
    submit(root);
    await vi.waitFor(() => expect(buttonWith(root, "sign-in link")).toBeDefined());
    buttonWith(root, "Email me a code")!.click();
    await vi.waitFor(() => expect(root.querySelector('input[type="password"]')).toBeNull());
    expect(send).toHaveBeenCalledWith({ email: user.email });
    expect(buttonWith(root, "sign-in link")).toBeUndefined();
    expect(emailInput(root)).toBeNull();

    buttonWith(root, "Choose a different method")!.click();
    await vi.waitFor(() => expect(root.querySelector('input[type="password"]')).not.toBeNull());
    expect(root.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe(user.email);
    expect(buttonWith(root, "sign-in link")).toBeDefined();
  });

  it("goes back to the email when it is the only method", async () => {
    status = { ...closed, password: false, emailOtp: true };
    vi.spyOn(client, "sendSignInCode").mockResolvedValue();
    const { root } = await render("/login");
    await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
    await fill(root, 'input[type="email"]', user.email);
    submit(root);
    await vi.waitFor(() => expect(buttonWith(root, "Back")).toBeDefined());
    buttonWith(root, "Back")!.click();
    await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
    expect(buttonWith(root, "Continue")).toBeDefined();
  });

  describe("after a sign-in on this device", () => {
    const remember = (method: string) =>
      (document.cookie = `better-auth.last_used_login_method=${method}; path=/`);
    afterEach(() => remember("; expires=Thu, 01 Jan 1970 00:00:00 GMT"));

    it("asks for the password right away", async () => {
      status = { ...closed, magicLink: true, emailOtp: true };
      remember("email");
      const { root } = await render("/login");
      await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
      await fill(root, 'input[type="email"]', user.email);
      submit(root);
      await vi.waitFor(() => expect(root.querySelector('input[type="password"]')).not.toBeNull());
      expect(buttonWith(root, "Email me a code")).toBeUndefined();
      buttonWith(root, "Choose a different method")!.click();
      await vi.waitFor(() => expect(buttonWith(root, "Email me a code")).toBeDefined());
    });

    it("sends the code right away", async () => {
      status = { ...closed, magicLink: true, emailOtp: true };
      remember("email-otp");
      const send = vi.spyOn(client, "sendSignInCode").mockResolvedValue();
      const { root } = await render("/login");
      await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
      await fill(root, 'input[type="email"]', user.email);
      submit(root);
      await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ email: user.email }));
      await vi.waitFor(() => expect(buttonWith(root, "Choose a different method")).toBeDefined());
      buttonWith(root, "Choose a different method")!.click();
      await vi.waitFor(() => expect(buttonWith(root, "sign-in link")).toBeDefined());
      expect(root.querySelector('input[type="password"]')).not.toBeNull();
    });
  });

  it("emails a sign-in link that comes back to the admin", async () => {
    status = { ...closed, password: false, magicLink: true };
    const send = vi.spyOn(client, "signInMagicLink").mockResolvedValue();
    const { root } = await render("/login");
    await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
    await fill(root, 'input[type="email"]', user.email);
    submit(root);
    await vi.waitFor(() => expect(root.textContent).toContain("Check your inbox"));
    expect(send).toHaveBeenCalledWith({
      email: user.email,
      callbackURL: adminLogin,
      errorCallbackURL: adminLogin,
    });
  });

  it("emails a code and signs in with it", async () => {
    status = { ...closed, password: false, emailOtp: true };
    const send = vi.spyOn(client, "sendSignInCode").mockResolvedValue();
    const signIn = vi
      .spyOn(client, "signInWithCode")
      .mockRejectedValueOnce(new CmsError(400, { code: "INVALID_OTP" }))
      .mockImplementation(async () => {
        vi.mocked(client.getSession).mockResolvedValue({ user } as never);
        return user as never;
      });
    const { router, root } = await render("/login");
    await vi.waitFor(() => expect(emailInput(root)).not.toBeNull());
    await fill(root, 'input[type="email"]', user.email);
    submit(root);
    await vi.waitFor(() =>
      expect(root.querySelectorAll('[data-slot="pin-input-slot"]')).toHaveLength(6),
    );
    expect(send).toHaveBeenCalledWith({ email: user.email });

    await fillCode(root, "000000");
    await vi.waitFor(() => expect(root.textContent).toContain("This code is not correct"));
    await fillCode(root, "123456");
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/content"));
    expect(signIn).toHaveBeenLastCalledWith({ email: user.email, otp: "123456" });
  });

  it("explains a used or expired link", async () => {
    const { router, root } = await render("/login?error=INVALID_TOKEN");
    await vi.waitFor(() =>
      expect(root.querySelector('[role="alert"]')?.textContent).toContain("invalid or has expired"),
    );
    expect(router.currentRoute.value.query.error).toBeUndefined();
  });
});

describe("passkey sign-in", () => {
  beforeEach(() => {
    vi.stubGlobal("PublicKeyCredential", { parseRequestOptionsFromJSON() {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const button = (root: Element) =>
    [...root.querySelectorAll("button")].find((b) => b.textContent?.includes("passkey"));

  it("is hidden when the server has no passkeys", async () => {
    const { root } = await render("/login");
    await vi.waitFor(() => expect(client.request).toHaveBeenCalledWith("/auth-status"));
    await vi.waitFor(() => expect(root.querySelector('input[type="email"]')).not.toBeNull());
    expect(button(root)).toBeUndefined();
  });

  it("is offered when the server has passkeys", async () => {
    status = { ...status, passkeys: true };
    const { root } = await render("/login");
    await vi.waitFor(() => expect(button(root)).toBeDefined());
  });
});

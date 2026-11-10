import { describe, expect, it, vi } from "vitest";
import { defineCms, definePlugin, ValidationError } from "../index.ts";
import { admin, base, origin, setup } from "./setup.ts";
import { libsql } from "../integrations/libsql/index.ts";

const from = "Site <hello@example.com>";
const message = { to: "reader@example.com", subject: "Hello", text: "Welcome" };

describe("email", () => {
  it("sends through the configured adapter without opening the database", async () => {
    const send = vi.fn(async () => {});
    const cms = defineCms({
      ...base,
      database: libsql("file:/unavailable/email-test.db"),
      email: { from, adapter: { send } },
    });
    expect(send).not.toHaveBeenCalled();
    await cms.email.send(message);
    await cms.withDrafts().email.send({ ...message, replyTo: "reply@example.com" });
    expect(send.mock.calls).toEqual([
      [{ ...message, from }],
      [{ ...message, from, replyTo: "reply@example.com" }],
    ]);
  });

  it("rejects sending without email configuration", async () => {
    await expect(defineCms(base).email.send(message)).rejects.toThrow("email");
  });

  it("keeps adapters and senders scoped to their instance", async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    await defineCms({ ...base, email: { from, adapter: { send: first } } }).email.send(message);
    await defineCms({
      ...base,
      email: { from: "other@example.com", adapter: { send: second } },
    }).email.send(message);
    expect(first).toHaveBeenCalledExactlyOnceWith({ ...message, from });
    expect(second).toHaveBeenCalledExactlyOnceWith({ ...message, from: "other@example.com" });
  });

  it("propagates delivery failures", async () => {
    const error = new Error("SMTP unavailable");
    const cms = defineCms({
      ...base,
      email: {
        from,
        adapter: {
          send: async () => {
            throw error;
          },
        },
      },
    });
    await expect(cms.email.send(message)).rejects.toBe(error);
  });

  it("rejects incomplete messages before calling the adapter", async () => {
    const send = vi.fn(async () => {});
    const cms = defineCms({ ...base, email: { from, adapter: { send } } });
    for (const invalid of [
      { ...message, to: "" },
      { ...message, to: [] },
      { ...message, to: "reader@example.com\r\nBcc: other@example.com" },
      { ...message, replyTo: "bad\naddress" },
      { ...message, subject: "" },
      { to: message.to, subject: message.subject },
    ])
      await expect(cms.email.send(invalid)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    await cms.email.send({ ...message, to: [message.to], text: undefined, html: "<p>Hello</p>" });
    expect(send).toHaveBeenCalledOnce();
  });

  it("makes email available to hooks and session instances", async () => {
    const send = vi.fn(async () => {});
    const cms = defineCms({
      ...base,
      email: { from, adapter: { send } },
      hooks: { afterChange: [({ cms }) => cms.email.send(message)] },
    });
    await cms.create("posts", { title: "Hello" });
    const scoped = await cms.withSession(new Request(origin));
    await scoped.email.send(message);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("lets a dynamic route validate browser input and send a server-controlled message", async () => {
    const send = vi.fn(async () => {});
    const contact = definePlugin({
      name: "contact",
      publicRoutes: (api) =>
        api.post("/:topic", async (c) => {
          const input = await c.req.json();
          if (typeof input.message !== "string" || !input.message.trim())
            throw new ValidationError({ message: "Required" });
          await c.var.cms.email.send({
            to: "team@example.com",
            subject: c.req.param("topic"),
            text: input.message,
          });
          return c.json({ ok: true });
        }),
    });
    const { client } = setup(
      defineCms({ ...base, email: { from, adapter: { send } }, plugins: [contact] }),
    );
    await expect(
      client.request("/contact/sales", { method: "POST", body: { message: "" } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(send).not.toHaveBeenCalled();
    await expect(
      client.request("/contact/sales", {
        method: "POST",
        body: { message: "Hello", to: "attacker@example.com" },
      }),
    ).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledExactlyOnceWith({
      from,
      to: "team@example.com",
      subject: "sales",
      text: "Hello",
    });
    await expect(
      client.request("/email/send", { method: "POST", body: message }),
    ).rejects.toBeDefined();
  });
});

describe("auth email", () => {
  it("returns to the configured admin path and consumes a reset token once", async () => {
    const send = vi.fn(async (_message: { text?: string }) => {});
    const { client, fetch } = setup(defineCms({ ...base, email: { from, adapter: { send } } }));
    await client.signUp(admin);
    await client.signOut();
    await client.requestPasswordReset({
      email: "missing@example.com",
      redirectTo: `${origin}/cms/reset-password`,
    });
    expect(send).not.toHaveBeenCalled();
    await client.requestPasswordReset({
      email: admin.email,
      redirectTo: `${origin}/cms/reset-password`,
    });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ from, to: admin.email, html: expect.any(String) }),
    );
    const link = send.mock.calls[0][0].text!.match(/https?:\/\/\S+/)![0];
    const response = await fetch(link);
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.origin + redirect.pathname).toBe(`${origin}/cms/reset-password`);
    const token = redirect.searchParams.get("token")!;
    expect(token).toBeTruthy();
    await expect(client.resetPassword({ token, newPassword: "short" })).rejects.toMatchObject({
      status: 400,
    });
    await client.resetPassword({ token, newPassword: "new-password123" });
    await expect(
      client.resetPassword({ token, newPassword: "another-password123" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(client.signIn(admin)).rejects.toMatchObject({ status: 401 });
    await client.signIn({ email: admin.email, password: "new-password123" });
    expect(await client.getSession()).not.toBeNull();
    const reused = await fetch(link);
    const failed = new URL(reused.headers.get("location")!);
    expect(failed.pathname).toBe("/cms/reset-password");
    expect(failed.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(failed.searchParams.has("token")).toBe(false);
  });

  it("replaces an auth template with an async function", async () => {
    const send = vi.fn(async () => {});
    const template = vi.fn(async ({ user, url }: { user: { name: string }; url: string }) => ({
      subject: `Reset for ${user.name}`,
      text: url,
      html: "<p>Custom</p>",
    }));
    const { client } = setup(
      defineCms({
        ...base,
        email: { from, adapter: { send }, templates: { resetPassword: template } },
      }),
    );
    await client.signUp(admin);
    await client.request("/auth/request-password-reset", {
      method: "POST",
      body: { email: admin.email },
    });
    expect(template).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ name: admin.name }),
        url: expect.any(String),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: admin.email,
        subject: `Reset for ${admin.name}`,
        html: "<p>Custom</p>",
      }),
    );
  });

  it("delivers email verification without making it a login requirement", async () => {
    const send = vi.fn(async (_message: { text?: string }) => {});
    const { client, fetch } = setup(defineCms({ ...base, email: { from, adapter: { send } } }));
    await client.signUp(admin);
    expect(send).not.toHaveBeenCalled();
    await client.request("/auth/send-verification-email", {
      method: "POST",
      body: { email: admin.email },
    });
    expect(send).toHaveBeenCalledOnce();
    const link = send.mock.calls[0][0].text!.match(/https?:\/\/\S+/)![0];
    const response = await fetch(link);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect((await client.getSession())?.user.emailVerified).toBe(true);
  });

  it("preserves host email callbacks and auth options, and defaults undefined ones", async () => {
    const send = vi.fn(async () => {});
    const reset = vi.fn(async () => {});
    const verify = vi.fn(async () => {});
    const cms = defineCms({
      ...base,
      email: { from, adapter: { send } },
      auth: {
        emailAndPassword: { enabled: true, sendResetPassword: reset, minPasswordLength: 12 },
        emailVerification: { sendVerificationEmail: verify, expiresIn: 1234 },
      },
    });
    const { options } = await cms.auth();
    expect(options.emailAndPassword?.sendResetPassword).toBe(reset);
    expect(options.emailAndPassword?.minPasswordLength).toBe(12);
    expect(options.emailVerification?.sendVerificationEmail).toBe(verify);
    expect(options.emailVerification?.expiresIn).toBe(1234);
    expect(send).not.toHaveBeenCalled();

    const omitted = (await defineCms(base).auth()).options;
    expect(omitted.emailAndPassword?.sendResetPassword).toBeUndefined();
    expect(omitted.emailVerification?.sendVerificationEmail).toBeUndefined();

    const fallback = defineCms({
      ...base,
      email: { from, adapter: { send: async () => {} } },
      auth: {
        emailAndPassword: { enabled: true, sendResetPassword: undefined },
        emailVerification: { sendVerificationEmail: undefined },
      },
    });
    const defaults = (await fallback.auth()).options;
    expect(defaults.emailAndPassword?.sendResetPassword).toBeTypeOf("function");
    expect(defaults.emailVerification?.sendVerificationEmail).toBeTypeOf("function");
  });
});

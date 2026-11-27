import { describe, expect, it, vi } from "vitest";
import { cloudflareEmail, type SendEmailBinding } from "./cloudflare.ts";

const message = {
  from: "My Site <hello@example.com>",
  to: "reader@example.com",
  subject: "Hello",
  text: "Welcome",
  html: "<p>Welcome</p>",
};

it("sends each message through the binding, with display names as address objects", async () => {
  const binding = { send: vi.fn().mockResolvedValue({ messageId: "1" }) };
  await expect(cloudflareEmail(binding).send(message)).resolves.toBeUndefined();
  expect(binding.send).toHaveBeenCalledExactlyOnceWith({
    from: { name: "My Site", email: "hello@example.com" },
    to: "reader@example.com",
    subject: "Hello",
    text: "Welcome",
    html: "<p>Welcome</p>",
  });

  await cloudflareEmail(binding).send({
    from: "hello@example.com",
    to: ['"Reader, A." <a@example.com>', "<b@example.com>"],
    replyTo: "Team <team@example.com>",
    subject: "Hello",
    text: "Welcome",
  });
  expect(binding.send).toHaveBeenLastCalledWith({
    from: "hello@example.com",
    to: [{ name: "Reader, A.", email: "a@example.com" }, "b@example.com"],
    replyTo: { name: "Team", email: "team@example.com" },
    subject: "Hello",
    text: "Welcome",
  });
});

it("propagates binding failures with their code", async () => {
  const error = Object.assign(new Error("sender not verified"), { code: "E_SENDER_NOT_VERIFIED" });
  const binding = { send: vi.fn().mockRejectedValue(error) };
  await expect(cloudflareEmail(binding).send(message)).rejects.toBe(error);
});

describe("with an API token", () => {
  const sendUrl = "https://api.cloudflare.com/client/v4/accounts/acc-1/email/sending/send";
  const sent = (result = {}) =>
    Response.json({
      success: true,
      errors: [],
      result: { delivered: ["reader@example.com"], permanent_bounces: [], queued: [], ...result },
    });

  it("posts each message to the REST API", async () => {
    const fetch = vi.fn().mockResolvedValue(sent());
    const adapter = cloudflareEmail({ accountId: "acc-1", apiToken: "token-1", fetch });
    await expect(
      adapter.send({ ...message, to: [message.to], replyTo: "Team <team@example.com>" }),
    ).resolves.toBeUndefined();

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(sendUrl);
    expect(init).toMatchObject({
      method: "POST",
      headers: { authorization: "Bearer token-1", "content-type": "application/json" },
    });
    expect(JSON.parse(init.body)).toEqual({
      from: { address: "hello@example.com", name: "My Site" },
      to: ["reader@example.com"],
      reply_to: "team@example.com",
      subject: "Hello",
      text: "Welcome",
      html: "<p>Welcome</p>",
    });
  });

  it("rejects an API error with Cloudflare's code", async () => {
    const body = {
      success: false,
      errors: [{ code: 10208, message: "email.sending.error.destination_not_verified" }],
      result: null,
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(body, { status: 403 }));
    await expect(
      cloudflareEmail({ accountId: "acc-1", apiToken: "token-1", fetch }).send(message),
    ).rejects.toMatchObject({
      code: 10208,
      message: expect.stringContaining("403: email.sending.error.destination_not_verified"),
    });
  });

  it("rejects an answer that is not JSON", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    await expect(
      cloudflareEmail({ accountId: "acc-1", apiToken: "token-1", fetch }).send(message),
    ).rejects.toThrow("502");
  });

  it("rejects a permanent bounce", async () => {
    const fetch = vi.fn().mockResolvedValue(sent({ permanent_bounces: ["reader@example.com"] }));
    await expect(
      cloudflareEmail({ accountId: "acc-1", apiToken: "token-1", fetch }).send(message),
    ).rejects.toThrow("bounced");
  });

  it("rejects without an account ID or an API token, before any request", async () => {
    const fetch = vi.fn();
    await expect(
      cloudflareEmail({ accountId: "", apiToken: "token-1", fetch }).send(message),
    ).rejects.toThrow("`accountId`");
    await expect(
      cloudflareEmail({ accountId: "acc-1", apiToken: "", fetch }).send(message),
    ).rejects.toThrow("`apiToken`");
    expect(fetch).not.toHaveBeenCalled();
  });
});

it("rejects without a binding", async () => {
  await expect(
    cloudflareEmail(undefined as unknown as SendEmailBinding).send(message),
  ).rejects.toThrow("binding");
});

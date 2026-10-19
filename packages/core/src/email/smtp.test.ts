import { beforeEach, expect, it, vi } from "vitest";
import { createTransport } from "nodemailer";
import { smtp } from "./smtp.ts";

vi.mock("nodemailer", () => ({ createTransport: vi.fn() }));

const sendMail = vi.fn();
const message = {
  from: "site@example.com",
  to: "reader@example.com",
  subject: "Hello",
  text: "Welcome",
};

beforeEach(() => {
  vi.clearAllMocks();
  sendMail.mockResolvedValue({ accepted: [message.to], rejected: [] });
  vi.mocked(createTransport).mockReturnValue({ sendMail } as unknown as ReturnType<
    typeof createTransport
  >);
});

it("creates a transport lazily and forwards each message", async () => {
  const options = {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    auth: { user: "a", pass: "b" },
  };
  const adapter = smtp(options);
  expect(createTransport).not.toHaveBeenCalled();
  await expect(adapter.send(message)).resolves.toBeUndefined();
  await adapter.send(message);
  expect(createTransport).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(options));
  expect(sendMail).toHaveBeenCalledTimes(2);
  expect(sendMail).toHaveBeenCalledWith(message);
});

it("propagates SMTP failures without retrying", async () => {
  const error = new Error("SMTP unavailable");
  sendMail.mockRejectedValueOnce(error);
  await expect(smtp({ host: "smtp.example.com" }).send(message)).rejects.toBe(error);
  expect(sendMail).toHaveBeenCalledOnce();
});

it("forwards native pooled SMTP options, TLS settings and explicit overrides", async () => {
  const adapter = smtp({
    host: "smtp.example.com",
    port: 587,
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    tls: { servername: "smtp.example.com", minVersion: "TLSv1.2" },
    requireTLS: false,
  });
  await adapter.send(message);
  expect(createTransport).toHaveBeenCalledExactlyOnceWith({
    host: "smtp.example.com",
    port: 587,
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    tls: { servername: "smtp.example.com", minVersion: "TLSv1.2" },
    requireTLS: false,
  });
});

it("rejects a partially rejected recipient list", async () => {
  sendMail.mockResolvedValueOnce({ accepted: [message.to], rejected: ["other@example.com"] });
  await expect(
    smtp({ host: "smtp.example.com" }).send({ ...message, to: [message.to, "other@example.com"] }),
  ).rejects.toThrow("recipient");
  expect(sendMail).toHaveBeenCalledOnce();
});

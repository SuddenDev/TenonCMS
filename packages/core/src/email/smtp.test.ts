import type { SMTPPoolOptions } from "nodemailer";
import { beforeEach, expect, it, vi } from "vitest";
import { connect as connectTcp } from "node:net";
import { connect as connectTls } from "node:tls";
import { createTransport } from "nodemailer";
import { smtp } from "./smtp.ts";

vi.mock("nodemailer", () => ({ createTransport: vi.fn() }));
vi.mock("node:net", () => ({ connect: vi.fn(() => "tcp socket") }));
vi.mock("node:tls", () => ({ connect: vi.fn(() => "tls socket") }));

const sendMail = vi.fn();
const message = {
  from: "site@example.com",
  to: "reader@example.com",
  subject: "Hello",
  text: "Welcome",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

it("opens the socket by host name on Workers", async () => {
  vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
  await smtp({ host: "smtp.example.com", port: 465 }).send(message);
  const { getSocket } = vi.mocked(createTransport).mock.calls[0]![0] as SMTPPoolOptions;
  const callback = vi.fn();

  getSocket!({ host: "smtp.example.com", port: 465, tls: { minVersion: "TLSv1.2" } }, callback);
  expect(connectTls).toHaveBeenCalledWith({
    host: "smtp.example.com",
    port: 465,
    servername: "smtp.example.com",
    minVersion: "TLSv1.2",
  });
  expect(callback).toHaveBeenLastCalledWith(null, { connection: "tls socket", secured: true });

  getSocket!({ host: "smtp.example.com", port: 587 }, callback);
  expect(connectTcp).toHaveBeenCalledWith({ host: "smtp.example.com", port: 587 });
  expect(callback).toHaveBeenLastCalledWith(null, { connection: "tcp socket", secured: false });
});

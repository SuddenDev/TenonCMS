import { connect as connectTcp } from "node:net";
import { connect as connectTls } from "node:tls";
import { createTransport, type SMTPPoolOptions } from "nodemailer";
import type { EmailAdapter } from "./types.ts";

/** SMTP delivery with native Nodemailer options, including pooling. Connects only when sending. */
export function smtp(options: SMTPPoolOptions): EmailAdapter {
  let transport: ReturnType<typeof createTransport> | undefined;
  return {
    async send(message) {
      const isWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
      transport ??= createTransport({
        requireTLS: true,
        ...(isWorkers && { getSocket: openSocketByHostName }),
        ...options,
      });
      const result = await transport.sendMail(message);
      if (result.rejected.length) throw new Error("tenoncms: SMTP rejected one or more recipients");
    },
  };
}

/**
 * Lets workerd resolve the host. Nodemailer's own lookup MUST NOT run on Workers: `node:dns` there returns CNAME
 * targets as addresses, and a TLS socket opened by IP fails the certificate check.
 */
const openSocketByHostName: NonNullable<SMTPPoolOptions["getSocket"]> = (options, callback) => {
  const port = Number(options.port) || (options.secure ? 465 : 587);
  const secure = options.secure ?? port === 465;
  const host = options.host || "localhost";
  const connection = secure
    ? connectTls({ servername: host, ...options.tls, host, port })
    : connectTcp({ host, port });
  callback(null, { connection, secured: secure });
};

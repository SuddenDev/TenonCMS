import { createTransport, type SMTPTransportOptions } from "nodemailer";
import type { EmailAdapter } from "./types.ts";

/** SMTP delivery through Nodemailer's ESM build. Connections open only when sending. */
export function smtp(options: SMTPTransportOptions): EmailAdapter {
  let transport: ReturnType<typeof createTransport> | undefined;
  return {
    async send(message) {
      transport ??= createTransport({ requireTLS: true, ...options });
      const result = await transport.sendMail(message);
      if (result.rejected.length)
        throw new Error("integral-cms: SMTP rejected one or more recipients");
    },
  };
}

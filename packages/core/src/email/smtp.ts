import { createTransport, type SMTPPoolOptions } from "nodemailer";
import type { EmailAdapter } from "./types.ts";

/** SMTP delivery with native Nodemailer options, including pooling. Connects only when sending. */
export function smtp(options: SMTPPoolOptions): EmailAdapter {
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

import { z } from "zod";
import type { EmailApi, EmailOptions } from "./types.ts";

const address = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^\r\n]+$/);

const messageSchema = z
  .object({
    from: address,
    to: z.union([address, z.array(address).min(1)]),
    replyTo: address.optional(),
    subject: z
      .string()
      .trim()
      .min(1)
      .regex(/^[^\r\n]+$/),
    text: z.string().optional(),
    html: z.string().optional(),
  })
  .refine((message) => !!(message.text?.trim() || message.html?.trim()), {
    message: "Email MUST have a text or HTML body",
  });

/** Binds delivery to one instance. It opens no connection and sends nothing at initialization. */
export function createEmail(options?: EmailOptions): EmailApi {
  return {
    async send(message) {
      if (!options) throw new Error("tenoncms: configure `email` before sending mail");
      const parsed = messageSchema.parse({ ...message, from: options.from });
      await options.adapter.send(parsed);
    },
  };
}

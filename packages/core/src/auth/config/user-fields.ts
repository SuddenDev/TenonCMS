import type { BetterAuthOptions } from "better-auth";
import { z } from "zod";
import { ADMIN_LOCALES } from "../../admin/browser/locale.ts";

const isTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Admin preferences on the user, written through better-auth's `/update-user`. `null` follows the browser.
 * A host's own field of the same name replaces core's.
 */
export const userFields = {
  language: {
    type: "string",
    required: false,
    validator: { input: z.enum(ADMIN_LOCALES).nullable() },
  },
  timezone: {
    type: "string",
    required: false,
    validator: { input: z.string().refine(isTimeZone, "Unknown time zone").nullable() },
  },
} satisfies NonNullable<NonNullable<BetterAuthOptions["user"]>["additionalFields"]>;

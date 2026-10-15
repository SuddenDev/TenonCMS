import { z } from "zod";
import { ADMIN_LOCALES } from "../browser/locale.ts";

const text = z.string().min(1);

/**
 * Whether `value` can be the URL of a page the admin bar shows on: a path starting with one `/`, or an absolute
 * http(s) URL. At most 2048 characters, no control characters.
 */
export function isPageUrl(value: string) {
  if (value.length > 2048 || /\p{Cc}/u.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//") && !value.startsWith("/\\");
  return URL.canParse(value) && /^https?:/.test(value);
}

const owner = z.union([
  z.strictObject({ collection: text, id: text.optional() }),
  z.strictObject({ global: text }),
]);
const queryValue = z.union([z.string(), z.null()]);
/** The admin language of a request. Loaders get it as `locale`. */
export const adminLocale = z.enum(ADMIN_LOCALES).default("en");

/**
 * The body of `POST /admin/load`.
 * - `field`: the loader of the `custom:<type>` field at `path` of a collection document or a global.
 * - `page`: the loader of the page `key`, with its route `params` and `query`.
 * - `bar-item`: the loader of one bar item, or one child of a dropdown, for the page at `url`.
 */
export const loadRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field"), type: text, path: text, owner, locale: adminLocale }),
  z.object({
    kind: z.literal("page"),
    key: text,
    params: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    query: z.record(z.string(), z.union([queryValue, z.array(queryValue)])),
    locale: adminLocale,
  }),
  z.object({
    kind: z.literal("bar-item"),
    id: text,
    url: z.string().refine(isPageUrl),
    locale: adminLocale,
  }),
]);

export type LoadRequest = z.infer<typeof loadRequest>;

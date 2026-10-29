// Runs in the admin, the admin bar and plugin browser code, so it MUST have no imports besides types.
import type { AdminLocale, Text } from "../index.d.ts";

/**
 * The string of `value` in `locale`: the string itself, else the entry of `locale`, then English, then the first.
 * @returns `undefined` for a missing or empty value.
 */
export function translate(value: Text | undefined, locale: AdminLocale): string | undefined {
  if (value === undefined || typeof value === "string") return value;
  return value[locale] ?? value.en ?? Object.values(value)[0];
}

/** Messages by admin language. Values are strings or nested objects, like the JSON files a plugin ships. */
export type Messages = Partial<Record<AdminLocale, Record<string, unknown>>>;

const at = (tree: unknown, key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      tree,
    );

/**
 * A lookup for a plugin's own browser strings. Keys are dotted paths, `{name}` fills a parameter.
 * A missing key falls back to English, then to the key itself.
 * @example
 * import en from "./locales/en.json";
 * import de from "./locales/de.json";
 * const t = translator({ en, de }, ctx.tenon.locale);
 * t("stats.count", { n: 3 });
 */
export function translator(messages: Messages, locale: AdminLocale) {
  return (key: string, params: Record<string, unknown> = {}) => {
    const found = at(messages[locale], key) ?? at(messages.en, key);
    if (typeof found !== "string") return key;
    return found.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

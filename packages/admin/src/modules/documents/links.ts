import type { Fields } from "../../../../core/src/schema";
import type { LinkReference } from "../../../../core/src/links/config/types";
import { linkingValues } from "../../../../core/src/links/runtime/fields";
import { safeLinkUrl } from "../../../../core/src/links/runtime/url";

/**
 * The URL that typed text stands for: a URL, path or fragment as it is, a domain with `https://`.
 * @returns `undefined` for text that is not a safe URL, like a title.
 */
export function urlFromText(text: string): string | undefined {
  const value = text.trim();
  if (/^([a-z][a-z\d+.-]*:|\/|#|\?)/i.test(value)) return safeLinkUrl(value) ? value : undefined;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value)) return `https://${value}`;
  return undefined;
}

/**
 * Whether the link list offers "File…": the text names a file (`file`, `Datei`), or nothing matches and the text is
 * not a URL.
 */
export function offersFile(text: string, matches: number) {
  if (/\b(file|datei)/i.test(text)) return true;
  return !matches && !urlFromText(text);
}

/** The host of a web URL, like `example.com`. Other URLs stay as they are. */
export function linkHost(href: string) {
  return /^https?:\/\//i.test(href) ? URL.parse(href)?.host || href : href;
}

/** The references of every `link` field in `data`, at any depth. */
export function linkReferences(fields: Fields, data: Record<string, any>): LinkReference[] {
  return linkingValues(fields, data).flatMap(({ field, value }) =>
    field.type === "link" && value?.reference ? [value.reference] : [],
  );
}

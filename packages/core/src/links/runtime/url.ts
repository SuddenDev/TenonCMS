// This file MUST have no imports. The admin bundles it.

/** Accepts web URLs, email, telephone, relative paths and fragments. Executable schemes are rejected. */
export function safeLinkUrl(value: unknown): value is string {
  if (typeof value !== "string" || /[\s\p{Cc}]/u.test(value)) return false;
  return !/^[a-z][a-z\d+.-]*:/i.test(value) || /^(https?:|mailto:|tel:)/i.test(value);
}

/** Whether `value` is a query and fragment to append to a URL: starts with `?` or `#`, no whitespace or control characters. */
export const isLinkSuffix = (value: unknown): value is string =>
  typeof value === "string" && /^[?#][^\s\p{Cc}]+$/u.test(value);

/**
 * Appends `suffix` to `href`. A `#` suffix replaces the fragment of `href`, a `?` suffix replaces its query and fragment.
 * Without a suffix, `href` stays as it is.
 */
export function withSuffix(href: string, suffix: string | undefined): string {
  if (!suffix) return href;
  const kept = href.replace(suffix.startsWith("?") ? /[?#].*$/s : /#.*$/s, "");
  return kept + suffix;
}

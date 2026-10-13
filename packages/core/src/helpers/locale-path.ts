// Helpers run in browser bundles too, so this file MUST have no imports.

/** The part of the localization config these helpers read. `core.localization` and `GET /localization` fit it. */
type Localization = {
  locales: readonly string[];
  defaultLocale: string;
  /** `false` adds no prefix. Default: `{ prefix: "except-default" }`. */
  routing?: { prefix: "except-default" | "always" } | false;
};

const prefixed = (l: Localization) => l.routing !== false;

/**
 * Splits a URL path into its locale and the unprefixed path: `/de/about` is `{ locale: "de", path: "/about" }`.
 * A first segment that is not a locale stays in the path. An unprefixed path is the default locale.
 */
export function localeFromPath(path: string, l: Localization): { locale: string; path: string } {
  const match = prefixed(l) ? /^\/([^/?#]+)(.*)$/.exec(path) : null;
  if (!match || !l.locales.includes(match[1]!)) return { locale: l.defaultLocale, path };
  const rest = match[2]!;
  return { locale: match[1]!, path: rest.startsWith("/") ? rest : `/${rest}` };
}

/**
 * Prefixes an unprefixed path with the locale: `/about`, `de` is `/de/about`.
 * The default locale stays unprefixed with `prefix: "except-default"`. Without routing, the path is returned as is.
 */
export function localizePath(path: string, locale: string, l: Localization): string {
  if (l.routing === false) return path;
  if (locale === l.defaultLocale && l.routing?.prefix !== "always") return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * Where a language switch leads: `alternates[locale]` when the document has one, else the current unprefixed
 * `path` in the target locale. `alternates` is the `alternates` metadata of a read.
 */
export function switchTarget(
  l: Localization,
  path: string,
  locale: string,
  alternates?: Record<string, string> | null,
): string {
  return alternates?.[locale] ?? localizePath(path, locale, l);
}

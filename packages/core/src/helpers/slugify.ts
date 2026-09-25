// This file MUST have no imports. The admin bundles it.

/**
 * The pattern every `slug` value MUST match: lowercase letters and digits, in parts joined by single dashes, e.g. `about-us`.
 * A regular expression source without `^` and `$`, like the `pattern` field option.
 */
export const SLUG_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*'

/**
 * Turns text into a slug that matches {@link SLUG_PATTERN}: `'Über uns!'` → `'uber-uns'`.
 * Accents are dropped, `ß` becomes `ss`, and every other run of characters that are not `a-z` or `0-9` becomes one `-`.
 * Returns `''` for text without letters or digits.
 */
export function slugify(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

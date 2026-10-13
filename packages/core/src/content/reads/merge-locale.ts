type Data = Record<string, unknown>;

/**
 * Builds the document of one locale. `keys` are the top-level keys that live in locale rows.
 * Shared keys come from `shared`. Each localized key takes `localized[key]`, then `fallback?.[key]`, then `null`.
 * A stored `null` falls back too. Stale values for other keys in locale rows are ignored.
 */
export function mergeLocale(
  keys: readonly string[],
  shared: Data,
  localized: Data | null | undefined,
  fallback: Data | null | undefined,
): Data {
  const out: Data = { ...shared };
  for (const key of keys) out[key] = localized?.[key] ?? fallback?.[key] ?? null;
  return out;
}

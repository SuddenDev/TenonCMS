type Data = Record<string, unknown>;

/**
 * Splits written data by storage. `keys` are the top-level keys that live in locale rows.
 * Only keys present in `data` are copied, so a partial write stays partial.
 */
export function splitLocale(
  keys: readonly string[],
  data: Data,
): { shared: Data; localized: Data } {
  const shared: Data = { ...data };
  const localized: Data = {};
  for (const key of keys) {
    if (!(key in data)) continue;
    localized[key] = data[key];
    delete shared[key];
  }
  return { shared, localized };
}

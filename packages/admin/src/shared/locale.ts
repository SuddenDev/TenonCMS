const displayNames = new Map<string, Intl.DisplayNames>();

/**
 * The name of a language in `inLanguage` (default: the language itself), with a capital first letter.
 * An invalid code gives the code back.
 */
export function localeLabel(code: string, inLanguage = code) {
  try {
    let names = displayNames.get(inLanguage);
    if (!names)
      displayNames.set(
        inLanguage,
        (names = new Intl.DisplayNames([inLanguage], { type: "language" })),
      );
    const name = names.of(code);
    return name ? name.charAt(0).toLocaleUpperCase(inLanguage) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/** A `?locale=` query value, when it is one of `locales`. */
export function queryLocale(value: unknown, locales: readonly string[]) {
  return typeof value === "string" && locales.includes(value) ? value : undefined;
}

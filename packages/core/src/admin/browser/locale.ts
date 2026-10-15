// Runs in the admin, the admin bar and the site's preview runtime, so it MUST have no imports besides types.
import type { AdminLocale } from "../index.d.ts";

/** The languages of the admin UI. Independent of the site's content locales. */
export const ADMIN_LOCALES = ["en", "de"] as const satisfies readonly AdminLocale[];

/** `localStorage` key of the admin language. The admin bar reads it too. */
export const ADMIN_LOCALE_KEY = "integral-admin-locale";

const supported = (code: string | null | undefined): code is AdminLocale =>
  (ADMIN_LOCALES as readonly string[]).includes(code ?? "");

/** The stored choice when it is supported, else the first browser language with a supported base, else `en`. */
export function pickAdminLocale(
  stored: string | null | undefined,
  languages: readonly string[],
): AdminLocale {
  if (supported(stored)) return stored;
  return languages.map((l) => l.split("-")[0].toLowerCase()).find(supported) ?? "en";
}

/** The admin language stored on this origin, else the browser's. A throwing storage counts as none. */
export function currentAdminLocale(): AdminLocale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(ADMIN_LOCALE_KEY);
  } catch {}
  return pickAdminLocale(stored, navigator.languages);
}

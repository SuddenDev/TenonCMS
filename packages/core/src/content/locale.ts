import type { Core, Scope } from "../cms/runtime/types.ts";
import { ValidationError } from "../errors.ts";

/** The locale options of a call. */
export type LocaleOptions = { locale?: string; fallback?: boolean };

/**
 * Applies the `locale` and `fallback` options of a call to its scope. An option wins over the scope's value, which a
 * nested call inherits from its caller. Without either, the default locale and the configured `fallback` apply.
 * @returns The scope for the call. Without `localization` it stays as it is.
 * @throws {ValidationError} For a locale outside `localization.locales`, or any locale without `localization`.
 */
export function withLocale(core: Core, scope: Scope, { locale, fallback }: LocaleOptions): Scope {
  const l = core.localization;
  if (locale !== undefined && !l?.locales.includes(locale))
    throw new ValidationError({ locale: "Unknown locale" });
  if (!l) return scope;
  return {
    ...scope,
    locale: locale ?? scope.locale ?? l.defaultLocale,
    fallback: fallback ?? scope.fallback ?? l.fallback,
  };
}

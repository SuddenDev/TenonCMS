import { ADMIN_LOCALES } from "../browser/locale.ts";
import type { AdminLocale, Text } from "../index.d.ts";

/** A registered `load` function with the name of the module that registered it, for error logs. */
export type Loader<C> = { source: string; load: (ctx: C) => unknown };

export type AnyLoad = (ctx: never) => unknown;

/** Whether `value` is a `clientRef()` result. */
export function isRef(value: unknown): value is { clientRef: string } {
  return !!value && typeof value === "object" && typeof (value as any).clientRef === "string";
}

/** Whether `value` is a {@link Text}: a non-empty string, or an object of non-empty strings by admin language. */
export function isText(value: unknown): value is Text {
  if (typeof value === "string") return !!value;
  if (!isObject(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(
      ([key, v]) => ADMIN_LOCALES.includes(key as AdminLocale) && typeof v === "string" && !!v,
    )
  );
}

/** Whether `value` is a plain-looking object: not `null`, not an array. */
export function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Checks that `value` is a `clientRef()` result.
 * @param path Names the option in the error, e.g. `admin.fields.color.mount`.
 * @throws If `value` is anything else.
 */
export function requireRef(value: unknown, path: string, source: string) {
  if (!isRef(value))
    throw new Error(
      `tenoncms: ${path} in ${source} MUST use clientRef() or an imported .client export transformed by the Tenon build integration`,
    );
  return value;
}

/**
 * Checks that `value` is a function or absent.
 * @returns The function, or `undefined`.
 * @throws If `value` is anything else.
 */
export function optionalLoad(value: unknown, path: string, source: string) {
  if (value !== undefined && typeof value !== "function")
    throw new Error(`tenoncms: ${path}.load in ${source} MUST be a function`);
  return value as AnyLoad | undefined;
}

/**
 * Deep-copies a JSON value, so the host cannot change it through its config object later.
 * @param where Names the option in the error message.
 * @throws If the value holds a function.
 */
export function copyConfig<T>(value: T, where: string): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "function")
        throw new Error(
          `tenoncms: ${where} MUST be JSON. Only load may be a function; use clientRef() for browser code`,
        );
      return v;
    }),
  );
}

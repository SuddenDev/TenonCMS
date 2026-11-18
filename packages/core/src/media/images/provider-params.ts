import type { Modifiers } from "../../schema/fields/image.ts";

/** A value of the `fit` modifier. */
export type Fit = NonNullable<Modifiers["fit"]>;

const ORDER = ["width", "height", "fit", "format", "quality", "background", "blur"] as const;

/**
 * A provider's parameters for `modifiers`, in a stable order. `names` renames each modifier; a modifier without a name
 * is left out. `fits` renames the `fit` value; a fit without an entry is left out.
 */
export function providerParams(
  modifiers: Modifiers,
  names: Partial<Record<keyof Modifiers, string>>,
  fits: Partial<Record<Fit, string>> = {},
): [string, string][] {
  return ORDER.flatMap((name) => {
    const value = modifiers[name];
    const param = names[name];
    if (value === undefined || !param) return [];
    if (name === "fit") return fits[value as Fit] ? [[param, fits[value as Fit]!]] : [];
    return [[param, String(value)]];
  });
}

/** `base` and `path` joined by one slash. */
export const joinUrl = (base: string, path: string) =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

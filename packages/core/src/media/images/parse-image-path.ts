import type { Modifiers } from "../../schema/fields/image.ts";
import { LONG, NUMERIC, modifierId } from "./modifiers.ts";

/**
 * Parses `<modifiers>/<key>` of an `/img` path, e.g. `w_640&f_webp/blog/hero.jpg`.
 * @returns The modifiers, their normalized `id` and the file key. `undefined` for a bad path.
 */
export function parseImgPath(
  path: string,
): { id: string; modifiers: Modifiers; key: string } | undefined {
  const slash = path.indexOf("/");
  if (slash < 1 || slash === path.length - 1) return undefined;

  const modifiers = parseModifiers(path.slice(0, slash));
  if (!modifiers) return undefined;

  return {
    id: modifierId(modifiers),
    modifiers,
    key: path.slice(slash + 1),
  };
}

// `<short name>_<value>` pairs, joined by `&` or `,`. `undefined` for an unknown name or a bad value.
function parseModifiers(text: string): Modifiers | undefined {
  const modifiers: Record<string, string | number> = {};

  for (const pair of text.split(/[&,]/)) {
    const i = pair.indexOf("_");
    const name = i > 0 ? LONG.get(pair.slice(0, i)) : undefined;
    const value = pair.slice(i + 1);

    if (!name || !value) return undefined;

    if (!NUMERIC.has(name)) {
      modifiers[name] = value;
    } else if (/^\d+$/.test(value)) {
      modifiers[name] = Number(value);
    } else {
      return undefined;
    }
  }

  return modifiers;
}

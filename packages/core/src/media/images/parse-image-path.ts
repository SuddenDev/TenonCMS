import type { Modifiers } from "../../schema/fields/image.ts";
import { LONG, NUMERIC, modifierId } from "./modifiers.ts";

/** Parses `<modifiers>/<key>` of an `/img` path. `id` is the normalized modifiers string. `undefined` for a bad path. */
export function parseImgPath(
  path: string,
): { id: string; modifiers: Modifiers; key: string } | undefined {
  const slash = path.indexOf("/");
  if (slash < 1 || slash === path.length - 1) return undefined;
  const modifiers: Record<string, string | number> = {};
  for (const part of path.slice(0, slash).split(/[&,]/)) {
    const i = part.indexOf("_");
    const name = LONG[part.slice(0, i)];
    const value = part.slice(i + 1);
    if (i < 1 || !name || !value) return undefined;
    if (NUMERIC.has(name) && !/^\d+$/.test(value)) return undefined;
    modifiers[name] = NUMERIC.has(name) ? Number(value) : value;
  }
  return { id: modifierId(modifiers), modifiers, key: path.slice(slash + 1) };
}

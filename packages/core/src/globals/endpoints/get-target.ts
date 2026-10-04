import type { Global } from "../../schema/index.ts";
import { notFound } from "../../http/errors.ts";

export function globalOf(entries: Record<string, Global>, name: string) {
  if (!Object.hasOwn(entries, name)) throw notFound();
  return { name, fields: entries[name].fields };
}

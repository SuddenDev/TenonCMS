import type { Collection } from "../../schema/index.ts";
import { notFound } from "../../http/errors.ts";

export function collectionOf(entries: Record<string, Collection>, name: string) {
  if (!Object.hasOwn(entries, name)) throw notFound();
  return { name, fields: entries[name].fields };
}

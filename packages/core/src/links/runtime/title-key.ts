// This file MUST have type imports only.
import type { Collection } from "../../collections/config/types.ts";

/** The field that names a link target: `titleField`, else the first text, textarea or slug field. */
export function linkTitleKey(entry: Pick<Collection, "titleField" | "fields">) {
  return (
    entry.titleField ??
    Object.keys(entry.fields).find((k) =>
      ["text", "textarea", "slug"].includes(entry.fields[k].type),
    )
  );
}

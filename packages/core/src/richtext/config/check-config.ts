import type { Block, Schema, Fields } from "../../schema/index.ts";
import { unseenBlocks } from "../../schema/traversal/blocks-of.ts";
import type { RichtextRegistration } from "./types.ts";
import { checkRichtextAllowed } from "../runtime/validation.ts";

/** Checks field feature names after plugin registrations are merged. */
export function checkRichtextConfig(
  schema: Schema,
  registrations: Record<string, RichtextRegistration>,
) {
  const seen = new Set<Block>();
  const walk = (fields: Fields) => {
    for (const f of Object.values(fields)) {
      if (f.type === "richtext") checkRichtextAllowed(f.allowed, registrations);
      if (f.type === "group" || f.type === "array") walk(f.fields);
      if (f.type === "blocks") for (const [, block] of unseenBlocks(f, seen)) walk(block.fields);
    }
  };

  for (const entry of [
    ...Object.values(schema.collections ?? {}),
    ...Object.values(schema.globals ?? {}),
  ])
    walk(entry.fields);
}

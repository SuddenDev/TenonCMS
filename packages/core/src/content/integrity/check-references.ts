import { type Database } from "../../db/types.ts";
import { type Fields } from "../../schema/index.ts";
import { relationPaths } from "../../schema/traversal/relation-paths.ts";
import { targetOf } from "../../schema/traversal/reference-fields.ts";
import { byIds } from "../../db/queries/documents/load-by-ids.query.ts";
import { existingIds } from "../../db/queries/references/existing-ids.query.ts";
import { accepts } from "../../media/library/names.ts";
import { ValidationError } from "../../errors.ts";
import type { Kysely } from "kysely";

/**
 * Every id MUST exist in its target collection. One query per relation field.
 * Files of `image` and `file` fields MUST also fit the field's `accept` and `maxSize`; an `image` only takes `image/*`.
 */
export async function checkRefs(
  db: Kysely<Database>,
  fields: Fields,
  data: Record<string, unknown>,
  self?: { collection: string; id: string },
) {
  for (const { path, field } of relationPaths(fields)) {
    const value = path.reduce<any>((o, k) => o?.[k], data);
    const ids: string[] = value == null ? [] : field.many ? value : [value];
    const fail = (message: string) => {
      throw new ValidationError({ [path.join(".")]: message });
    };
    const to = targetOf(field);
    if (self && to === self.collection && ids.includes(self.id))
      fail("A document cannot reference itself");
    if (!ids.length) continue;
    if (field.type === "relation") {
      const found = await existingIds(db, to, ids);
      if (found.length !== new Set(ids).size) fail(`Unknown id in "${to}"`);
      continue;
    }
    const files = await byIds(db, to, ids);
    if (files.length !== new Set(ids).size) fail(`Unknown id in "${to}"`);
    for (const f of files) {
      if (field.type === "image" && !accepts(["image/*"], f.mimeType)) fail("Not an image");
      if (!accepts(field.accept, f.mimeType)) fail(`Type "${f.mimeType}" is not accepted`);
      if (field.maxSize !== undefined && f.size > field.maxSize)
        fail(`Larger than ${field.maxSize} bytes`);
    }
  }
}

import type { Core } from "../../cms/runtime/types.ts";
import type { Fields } from "../../schema/fields/index.ts";
import type { Db } from "../../db/queries/document-sql.ts";
import { existingIds } from "../../db/queries/references/existing-ids.query.ts";
import { loadByIds } from "../../db/queries/documents/load-by-ids.query.ts";
import { ValidationError } from "../../errors.ts";
import { richtextFields } from "../runtime/fields.ts";
import { richtextReferences } from "../runtime/walk.ts";

/**
 * Checks live embedded targets at publication. Deleted references remain available for repair.
 * @throws {ValidationError} When a collection, document or image target is invalid.
 */
export async function checkRichtextReferences(
  db: Db,
  core: Core,
  fields: Fields,
  data: Record<string, any>,
) {
  const held = richtextFields(fields, data);
  const targets = new Map<string, Set<string>>();

  for (const f of held)
    for (const { reference: ref } of richtextReferences(f.value)) {
      if (!Object.hasOwn(core.schema.collections, ref.collection))
        throw new ValidationError({ [f.path]: `Unknown collection "${ref.collection}"` });

      if (!ref.deleted) {
        if (!targets.has(ref.collection)) targets.set(ref.collection, new Set());
        targets.get(ref.collection)!.add(ref.id);
      }
    }

  for (const [collection, ids] of targets) {
    const found = new Set(await existingIds(db, collection, [...ids]));
    const images =
      collection === "media"
        ? new Map((await loadByIds(db, collection, [...ids], true)).map((d) => [d.id, d]))
        : undefined;

    for (const f of held)
      for (const { node, reference: ref } of richtextReferences(f.value)) {
        if (ref.deleted || ref.collection !== collection) continue;
        if (!found.has(ref.id))
          throw new ValidationError({ [f.path]: `Unknown id in "${collection}"` });
        if (
          node.type === "image" &&
          (collection !== "media" || !String(images?.get(ref.id)?.mimeType).startsWith("image/"))
        )
          throw new ValidationError({ [f.path]: "Not an image" });
      }
  }
}

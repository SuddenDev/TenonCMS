import type { Core } from "../../cms/runtime/types.ts";
import type { Fields } from "../../schema/fields/index.ts";
import { ValidationError } from "../../errors.ts";
import { linkingValues } from "../runtime/fields.ts";
import { deletedTargets, keepDeletedMarker } from "../runtime/held-links.ts";

/**
 * Checks that `link` references name a collection with a `permalink` and protects server-owned deletion markers.
 * Runs on every write, including drafts. Mutates `data`.
 * @throws {ValidationError} At the field's positional path.
 */
export function prepareLinks(
  core: Core,
  fields: Fields,
  data: Record<string, any>,
  source: Record<string, any> | undefined,
) {
  const deleted = deletedTargets(fields, source);

  for (const { path, field, value } of linkingValues(fields, data)) {
    if (field.type !== "link" || !value.reference) continue;

    try {
      const { collection } = value.reference;
      if (!core.schema.collections[collection]?.permalink)
        throw new Error(`Unknown collection "${collection}"`);

      keepDeletedMarker(value.reference, deleted);
    } catch (error) {
      throw new ValidationError({ [path]: (error as Error).message });
    }
  }
}

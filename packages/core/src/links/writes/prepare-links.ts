import type { Core } from "../../cms/runtime/types.ts";
import type { Fields, LinkField } from "../../schema/fields/index.ts";
import type { LinkKind, LinkValue } from "../config/types.ts";
import { ValidationError } from "../../errors.ts";
import { linkingValues } from "../runtime/fields.ts";
import { deletedTargets, keepDeletedMarker } from "../runtime/held-links.ts";
import { linkKind } from "../runtime/value.ts";

/**
 * Checks that `link` values fit `allowed` and that references name a collection with a `permalink` or a media file, and protects server-owned deletion markers.
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
    if (field.type !== "link") continue;

    try {
      requireAllowedLink(core, field, value);
      if (value.reference) keepDeletedMarker(value.reference, deleted);
    } catch (error) {
      throw new ValidationError({ [path]: (error as Error).message });
    }
  }
}

const kindNames: Record<LinkKind, string> = {
  internal: "documents",
  external: "URLs",
  file: "files",
};

// Runs after the zod check, so `value` has a valid shape.
function requireAllowedLink(core: Core, field: LinkField, value: LinkValue) {
  const kind = linkKind(value);
  if (field.allowed && !field.allowed.includes(kind))
    throw new Error(`Links to ${kindNames[kind]} are not allowed`);
  if (!("reference" in value)) return;

  const { collection } = value.reference;
  const known = kind === "file" ? !!core.media : !!core.schema.collections[collection]?.permalink;
  if (!known) throw new Error(`Unknown collection "${collection}"`);
}

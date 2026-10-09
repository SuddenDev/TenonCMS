import { HTTPException } from "hono/http-exception";
import type { Core } from "../../cms/runtime/types.ts";
import { collectionOf } from "../../collections/endpoints/get-target.ts";
import { globalOf } from "../../globals/endpoints/get-target.ts";
import { notFound } from "../../http/errors.ts";
import type { Field, LocalApi } from "../../schema/index.ts";
import { fieldAt } from "../../schema/traversal/field-at.ts";
import type { LoadRequest } from "./load-request.ts";

/**
 * Finds the field a field loader runs for, and checks that the request names it truly.
 * @param cms The local API of the caller. It decides which documents exist.
 * @returns The field definition from the schema.
 * @throws 404 for an unknown collection, global or document. 400 if `path` is not a stored field of type
 * `custom:<type>` of the owner.
 */
export async function fieldTarget(
  core: Core,
  cms: LocalApi,
  { type, path, owner }: Extract<LoadRequest, { kind: "field" }>,
): Promise<Field> {
  const { fields } =
    "global" in owner
      ? globalOf(core.schema.globals, owner.global)
      : collectionOf(core.schema.collections, owner.collection);
  const field = fieldAt(fields, path);
  if (field?.type !== `custom:${type}`)
    throw new HTTPException(400, { message: `"${path}" is not a custom:${type} field` });
  if ("collection" in owner && owner.id !== undefined) {
    const doc = await cms.findById(owner.collection, owner.id, { populate: false });
    if (!doc) throw notFound();
  }
  return field;
}

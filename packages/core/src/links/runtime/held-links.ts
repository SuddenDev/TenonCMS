import type { Fields } from "../../schema/fields/index.ts";
import { richtextReferences } from "../../richtext/runtime/walk.ts";
import type { LinkReference } from "../config/types.ts";
import { isObject } from "../../schema/condition.ts";
import { linkingValues } from "./fields.ts";
import { linkKey } from "./value.ts";

/** One reference in a stored value. `clear()` removes the read decoration of its target. */
export type HeldLink = {
  path: string;
  reference: LinkReference;
  image: boolean;
  clear(): void;
};

/** Every reference held by rich text and `link` fields inside `data`, at any depth, in field order. */
export function heldLinks(fields: Fields, data: Record<string, any>): HeldLink[] {
  return linkingValues(fields, data).flatMap(({ path, field, value }) => {
    if (field.type === "link")
      return isObject(value?.reference)
        ? [{ path, reference: value.reference, image: false, clear: () => delete value.href }]
        : [];

    return richtextReferences(value).map(({ node, reference }) => ({
      path,
      reference,
      image: node.type === "image",
      clear() {
        delete node.attrs!.href;
        delete node.attrs!.src;
        delete node.attrs!.srcset;
      },
    }));
  });
}

/**
 * Keeps the server-owned `deleted` marker: a reference to a target in `deleted` gets it, and a marker the server did
 * not set throws.
 * @param deleted Keys of the deleted targets of the stored value, see {@link linkKey}.
 * @throws {Error} For a marker on a target outside `deleted`.
 */
export function keepDeletedMarker(reference: LinkReference, deleted: Set<string>) {
  const known = deleted.has(linkKey(reference));
  if (reference.deleted && !known) throw new Error("Deletion markers are owned by the server");
  if (known) reference.deleted = true;
}

/** Keys of the deleted targets that `data` holds. */
export function deletedTargets(fields: Fields, data: Record<string, any> | undefined) {
  return new Set(
    heldLinks(fields, data ?? {})
      .filter((h) => h.reference.deleted)
      .map((h) => linkKey(h.reference)),
  );
}

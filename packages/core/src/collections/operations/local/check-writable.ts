import type { Core } from "../../../cms/runtime/types.ts";
import { known } from "../../../content/targets.ts";
import { ValidationError } from "../../../errors.ts";

/**
 * Checks if a collection is writable.
 * Throws a ValidationError if the collection is not writable.
 */
export function writable(core: Core, collection: string) {
  known(core, "collection", collection);

  // Media documents change only through `cms.media`.
  if (collection === "media")
    throw new ValidationError({ "": "Media documents change only through the media API" });
}

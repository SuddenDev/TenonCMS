import type { Core } from "../../../cms/runtime/types.ts";
import { known } from "../../../content/targets.ts";
import { ValidationError } from "../../../errors.ts";

// Media documents change only through `cms.media`.
export function writable(core: Core, collection: string) {
  known(core, "collection", collection);
  if (collection === "media")
    throw new ValidationError({ "": "Media documents change only through the media API" });
}

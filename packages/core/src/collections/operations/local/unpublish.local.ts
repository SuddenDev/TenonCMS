import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { collectionTarget, draftable } from "../../../content/targets.ts";
import { unpublish } from "../unpublish.operation.ts";
import { writable } from "./check-writable.ts";
import { withLocale } from "../../../content/locale.ts";

export const unpublishLocal =
  (core: Core, scope: Scope): LocalApi["unpublish"] =>
  async (collection, id, options = {}) => {
    writable(core, collection);
    draftable(core, collectionTarget(collection));

    return unpublish(core, withLocale(core, scope, options), collection, id, options.updatedAt);
  };

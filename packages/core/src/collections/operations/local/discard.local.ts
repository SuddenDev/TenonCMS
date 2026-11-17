import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { collectionTarget, requireDraftsEnabled } from "../../../content/targets.ts";
import { discard } from "../discard.operation.ts";
import { requireWritableCollection } from "./check-writable.ts";
import { withLocale } from "../../../content/locale.ts";

export const discardLocal =
  (core: Core, scope: Scope): LocalApi["discard"] =>
  async (collection, id, options = {}) => {
    const { all = false } = options;
    requireWritableCollection(core, collection);
    requireDraftsEnabled(core, collectionTarget(collection));

    return discard(core, withLocale(core, scope, options), collection, id, all, options);
  };

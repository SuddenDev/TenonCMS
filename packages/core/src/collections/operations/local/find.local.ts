import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { requireKnownTarget } from "../../../content/targets.ts";
import { find } from "../find.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const findLocal =
  (core: Core, scope: Scope): LocalApi["find"] =>
  async (collection, options = {}) => {
    requireKnownTarget(core, "collection", collection);
    return find(core, withLocale(core, scope, options), collection, options);
  };

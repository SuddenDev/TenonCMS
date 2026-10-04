import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { known } from "../../../content/targets.ts";
import { find } from "../find.operation.ts";

export const findLocal =
  (core: Core, scope: Scope): LocalApi["find"] =>
  async (collection, options = {}) => {
    known(core, "collection", collection);
    return find(core, scope, collection, options);
  };

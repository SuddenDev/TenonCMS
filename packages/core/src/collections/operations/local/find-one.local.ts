import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { known } from "../../../content/targets.ts";
import { findOne } from "../find.operation.ts";

export const findOneLocal =
  (core: Core, scope: Scope): LocalApi["findOne"] =>
  async (collection, options) => {
    known(core, "collection", collection);
    return findOne(core, scope, collection, options);
  };

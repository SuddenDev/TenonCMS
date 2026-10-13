import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { known } from "../../../content/targets.ts";
import { findOne } from "../find.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const findOneLocal =
  (core: Core, scope: Scope): LocalApi["findOne"] =>
  async (collection, options) => {
    known(core, "collection", collection);
    return findOne(core, withLocale(core, scope, options), collection, options);
  };

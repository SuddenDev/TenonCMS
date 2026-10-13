import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { known } from "../../../content/targets.ts";
import { findById } from "../find.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const findByIdLocal =
  (core: Core, scope: Scope): LocalApi["findById"] =>
  async (collection, id, options = {}) => {
    known(core, "collection", collection);
    return findById(core, withLocale(core, scope, options), collection, id, options);
  };

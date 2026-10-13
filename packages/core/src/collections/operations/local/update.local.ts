import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { col, draftable } from "../../../content/targets.ts";
import { update } from "../update.operation.ts";
import { writable } from "./check-writable.ts";
import { withLocale } from "../../../content/locale.ts";

export const updateLocal =
  (core: Core, scope: Scope): LocalApi["update"] =>
  async (collection, id, data, options = {}) => {
    const { draft = false } = options;
    writable(core, collection);
    if (draft) draftable(core, col(collection));
    return update(core, withLocale(core, scope, options), collection, id, data, { draft });
  };

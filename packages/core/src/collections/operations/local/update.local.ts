import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { col, draftable } from "../../../content/targets.ts";
import { update } from "../update.operation.ts";
import { writable } from "./check-writable.ts";

export const updateLocal =
  (core: Core, scope: Scope): LocalApi["update"] =>
  async (collection, id, data, { draft = false } = {}) => {
    writable(core, collection);
    if (draft) draftable(core, col(collection));
    return update(core, scope, collection, id, data, { draft });
  };

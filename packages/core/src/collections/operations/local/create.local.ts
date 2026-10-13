import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { col, draftable } from "../../../content/targets.ts";
import { create } from "../create.operation.ts";
import { writable } from "./check-writable.ts";
import { withLocale } from "../../../content/locale.ts";

export const createLocal =
  (core: Core, scope: Scope): LocalApi["create"] =>
  async (collection, data, options = {}) => {
    const { draft = false } = options;
    writable(core, collection);
    if (draft) draftable(core, col(collection));
    return (await create(core, withLocale(core, scope, options), collection, data, draft))!;
  };

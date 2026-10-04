import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { col, draftable } from "../../../content/targets.ts";
import { create } from "../create.operation.ts";
import { writable } from "./check-writable.ts";

export const createLocal =
  (core: Core, scope: Scope): LocalApi["create"] =>
  async (collection, data, { draft = false } = {}) => {
    writable(core, collection);
    if (draft) draftable(core, col(collection));
    return (await create(core, scope, collection, data, draft))!;
  };

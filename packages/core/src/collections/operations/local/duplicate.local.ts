import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { duplicate } from "../duplicate.operation.ts";
import { requireWritableCollection } from "./check-writable.ts";

export const duplicateLocal =
  (core: Core, scope: Scope): LocalApi["duplicate"] =>
  async (collection, id) => {
    requireWritableCollection(core, collection);
    return duplicate(core, scope, collection, id);
  };

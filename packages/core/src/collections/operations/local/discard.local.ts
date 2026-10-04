import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { col, draftable } from "../../../content/targets.ts";
import { discard } from "../discard.operation.ts";
import { writable } from "./check-writable.ts";

export const discardLocal =
  (core: Core, scope: Scope): LocalApi["discard"] =>
  async (collection, id) => {
    writable(core, collection);
    draftable(core, col(collection));
    return discard(core, scope, collection, id);
  };

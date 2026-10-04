import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { publish } from "../publish.operation.ts";
import { writable } from "./check-writable.ts";

export const publishLocal =
  (core: Core, scope: Scope): LocalApi["publish"] =>
  async (collection, id) => {
    writable(core, collection);
    return publish(core, scope, collection, id);
  };

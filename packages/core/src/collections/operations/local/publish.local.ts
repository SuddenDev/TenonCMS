import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { publish } from "../publish.operation.ts";
import { writable } from "./check-writable.ts";
import { withLocale } from "../../../content/locale.ts";

export const publishLocal =
  (core: Core, scope: Scope): LocalApi["publish"] =>
  async (collection, id, options = {}) => {
    writable(core, collection);
    return publish(core, withLocale(core, scope, options), collection, id);
  };

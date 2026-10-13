import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { copyLocale } from "../copy-locale.operation.ts";
import { writable } from "./check-writable.ts";
import { withLocale } from "../../../content/locale.ts";

export const copyLocaleLocal =
  (core: Core, scope: Scope): LocalApi["copyLocale"] =>
  async (collection, id, { from, to }) => {
    writable(core, collection);
    return copyLocale(core, withLocale(core, scope, { locale: to }), collection, id, from);
  };

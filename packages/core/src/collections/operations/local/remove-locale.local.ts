import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { removeLocale } from "../remove-locale.operation.ts";
import { requireWritableCollection } from "./check-writable.ts";
import { withLocale } from "../../../content/locale.ts";

export const removeLocaleLocal =
  (core: Core, scope: Scope): LocalApi["removeLocale"] =>
  async (collection, id, locale) => {
    requireWritableCollection(core, collection);
    return removeLocale(core, withLocale(core, scope, { locale }), collection, id);
  };

import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { known } from "../../../content/targets.ts";
import { removeGlobalLocale } from "../remove-locale.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const removeGlobalLocaleLocal =
  (core: Core, scope: Scope): LocalApi["removeGlobalLocale"] =>
  async (name, locale) => {
    known(core, "global", name);
    return (await removeGlobalLocale(core, withLocale(core, scope, { locale }), name))!;
  };

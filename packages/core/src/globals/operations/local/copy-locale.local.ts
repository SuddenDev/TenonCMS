import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { known } from "../../../content/targets.ts";
import { copyGlobalLocale } from "../copy-locale.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const copyGlobalLocaleLocal =
  (core: Core, scope: Scope): LocalApi["copyGlobalLocale"] =>
  async (name, { from, to }) => {
    known(core, "global", name);
    return (await copyGlobalLocale(core, withLocale(core, scope, { locale: to }), name, from))!;
  };

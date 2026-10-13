import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { known } from "../../../content/targets.ts";
import { publishGlobal } from "../publish.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const publishGlobalLocal =
  (core: Core, scope: Scope): LocalApi["publishGlobal"] =>
  async (name, options = {}) => {
    known(core, "global", name);
    return (await publishGlobal(core, withLocale(core, scope, options), name))!;
  };

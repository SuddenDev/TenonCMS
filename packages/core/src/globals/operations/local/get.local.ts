import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { requireKnownTarget } from "../../../content/targets.ts";
import { getGlobal } from "../get.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const getGlobalLocal =
  (core: Core, scope: Scope): LocalApi["getGlobal"] =>
  async (name, options = {}) => {
    requireKnownTarget(core, "global", name);
    return getGlobal(core, withLocale(core, scope, options), name, options);
  };

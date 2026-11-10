import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { globalTarget, known, draftable } from "../../../content/targets.ts";
import { unpublishGlobal } from "../unpublish.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const unpublishGlobalLocal =
  (core: Core, scope: Scope): LocalApi["unpublishGlobal"] =>
  async (name, options = {}) => {
    known(core, "global", name);
    draftable(core, globalTarget(name));
    return (await unpublishGlobal(
      core,
      withLocale(core, scope, options),
      name,
      options.updatedAt,
    ))!;
  };

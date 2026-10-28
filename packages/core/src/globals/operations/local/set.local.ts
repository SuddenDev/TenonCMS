import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { globalTarget, known, draftable } from "../../../content/targets.ts";
import { setGlobal } from "../set.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const setGlobalLocal =
  (core: Core, scope: Scope): LocalApi["setGlobal"] =>
  async (name, data, options = {}) => {
    const { draft = false } = options;
    known(core, "global", name);
    if (draft) draftable(core, globalTarget(name));
    return (await setGlobal(
      core,
      withLocale(core, scope, options),
      name,
      data,
      draft ? "draft" : "save",
      options.updatedAt,
    ))!;
  };

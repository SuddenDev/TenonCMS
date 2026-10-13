import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { glob, known, draftable } from "../../../content/targets.ts";
import { discardGlobal } from "../discard.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const discardGlobalLocal =
  (core: Core, scope: Scope): LocalApi["discardGlobal"] =>
  async (name, options = {}) => {
    const { all = false } = options;
    known(core, "global", name);
    draftable(core, glob(name));
    return (await discardGlobal(core, withLocale(core, scope, options), name, all))!;
  };

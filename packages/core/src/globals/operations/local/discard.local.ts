import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import {
  globalTarget,
  requireKnownTarget,
  requireDraftsEnabled,
} from "../../../content/targets.ts";
import { discardGlobal } from "../discard.operation.ts";
import { withLocale } from "../../../content/locale.ts";

export const discardGlobalLocal =
  (core: Core, scope: Scope): LocalApi["discardGlobal"] =>
  async (name, options = {}) => {
    const { all = false } = options;
    requireKnownTarget(core, "global", name);
    requireDraftsEnabled(core, globalTarget(name));
    return (await discardGlobal(core, withLocale(core, scope, options), name, all))!;
  };

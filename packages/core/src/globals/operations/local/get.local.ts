import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { known } from "../../../content/targets.ts";
import { getGlobal } from "../get.operation.ts";

export const getGlobalLocal =
  (core: Core, scope: Scope): LocalApi["getGlobal"] =>
  async (name, options = {}) => {
    known(core, "global", name);
    return getGlobal(core, scope, name, options);
  };

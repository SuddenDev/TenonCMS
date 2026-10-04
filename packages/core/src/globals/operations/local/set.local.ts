import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { glob, known, draftable } from "../../../content/targets.ts";
import { setGlobal } from "../set.operation.ts";

export const setGlobalLocal =
  (core: Core, scope: Scope): LocalApi["setGlobal"] =>
  async (name, data, { draft = false } = {}) => {
    known(core, "global", name);
    if (draft) draftable(core, glob(name));
    return (await setGlobal(core, scope, name, data, { draft }))!;
  };

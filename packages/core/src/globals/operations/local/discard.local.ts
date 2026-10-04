import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { glob, known, draftable } from "../../../content/targets.ts";
import { discardGlobal } from "../discard.operation.ts";

export const discardGlobalLocal =
  (core: Core, scope: Scope): LocalApi["discardGlobal"] =>
  async (name) => {
    known(core, "global", name);
    draftable(core, glob(name));
    return (await discardGlobal(core, scope, name))!;
  };

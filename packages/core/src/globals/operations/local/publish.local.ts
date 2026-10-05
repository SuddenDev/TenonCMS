import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { known } from "../../../content/targets.ts";
import { publishGlobal } from "../publish.operation.ts";

export const publishGlobalLocal =
  (core: Core, scope: Scope): LocalApi["publishGlobal"] =>
  async (name) => {
    known(core, "global", name);
    return (await publishGlobal(core, scope, name))!;
  };

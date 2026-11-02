import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { known } from "../../../content/targets.ts";
import { withLocale } from "../../../content/locale.ts";
import { setGlobalSyncStructure } from "../sync-structure.operation.ts";

export const setGlobalSyncStructureLocal =
  (core: Core, scope: Scope): LocalApi["setGlobalSyncStructure"] =>
  async (name, sync, { locale, dryRun } = {}) => {
    known(core, "global", name);
    return setGlobalSyncStructure(core, withLocale(core, scope, { locale }), name, sync, dryRun);
  };

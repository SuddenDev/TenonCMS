import type { Core, Scope } from "../../cms/runtime/types.ts";
import { globalTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { type SyncChoice, setSyncStructure } from "../../content/writes/sync-structure.ts";

/** `scope.locale` is the locale whose structure a switch to on shares. */
export const setGlobalSyncStructure = (
  core: Core,
  scope: Scope,
  name: string,
  sync: SyncChoice,
  dryRun?: boolean,
) =>
  runOperation(core, scope, "setGlobal", globalTarget(name), { global: name }, (s) =>
    setSyncStructure(core, s, globalTarget(name), undefined, sync, dryRun),
  );

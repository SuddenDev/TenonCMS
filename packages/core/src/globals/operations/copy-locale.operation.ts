import type { Core, Scope } from "../../cms/runtime/types.ts";
import { globalTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { copyLocalized } from "../../content/writes/copy-locale.ts";

/** `scope.locale` is the target locale. */
export const copyGlobalLocale = (core: Core, scope: Scope, name: string, from: string) =>
  runOperation(core, scope, "setGlobal", globalTarget(name), { global: name }, (s) =>
    copyLocalized(core, s, globalTarget(name), undefined, from),
  );

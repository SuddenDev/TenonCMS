import type { Core, Scope } from "../../cms/runtime/types.ts";
import { globalTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { removeLocalized } from "../../content/writes/remove-locale.ts";

/** `scope.locale` is the locale to remove. */
export const removeGlobalLocale = (core: Core, scope: Scope, name: string) =>
  runOperation(core, scope, "setGlobal", globalTarget(name), { global: name }, (s) =>
    removeLocalized(core, s, globalTarget(name), undefined),
  );

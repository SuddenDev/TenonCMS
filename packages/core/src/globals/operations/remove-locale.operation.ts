import type { Core, Scope } from "../../cms/runtime/types.ts";
import { glob } from "../../content/targets.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { removeLocalized } from "../../content/writes/remove-locale.ts";

/** `scope.locale` is the locale to remove. */
export const removeGlobalLocale = (core: Core, scope: Scope, name: string) =>
  run(core, scope, "setGlobal", glob(name), { global: name }, (s) =>
    removeLocalized(core, s, glob(name), undefined),
  );

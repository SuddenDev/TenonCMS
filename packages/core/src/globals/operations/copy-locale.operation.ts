import type { Core, Scope } from "../../cms/runtime/types.ts";
import { glob } from "../../content/targets.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { copyLocalized } from "../../content/writes/copy-locale.ts";

/** `scope.locale` is the target locale. */
export const copyGlobalLocale = (core: Core, scope: Scope, name: string, from: string) =>
  run(core, scope, "setGlobal", glob(name), { global: name }, (s) =>
    copyLocalized(core, s, glob(name), undefined, from),
  );

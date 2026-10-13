import type { Core, Scope } from "../../cms/runtime/types.ts";
import { col } from "../../content/targets.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { removeLocalized } from "../../content/writes/remove-locale.ts";

/** `scope.locale` is the locale to remove. */
export const removeLocale = (core: Core, scope: Scope, collection: string, id: string) =>
  run(core, scope, "update", col(collection), { collection, id }, (s, args) =>
    removeLocalized(core, s, col(collection), args.id),
  );

import type { Core, Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { removeLocalized } from "../../content/writes/remove-locale.ts";

/** `scope.locale` is the locale to remove. */
export const removeLocale = (core: Core, scope: Scope, collection: string, id: string) =>
  runOperation(core, scope, "update", collectionTarget(collection), { collection, id }, (s, args) =>
    removeLocalized(core, s, collectionTarget(collection), args.id),
  );

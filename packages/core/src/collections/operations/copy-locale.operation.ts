import type { Core, Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { copyLocalized } from "../../content/writes/copy-locale.ts";

/** `scope.locale` is the target locale. */
export const copyLocale = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  from: string,
) =>
  runOperation(core, scope, "update", collectionTarget(collection), { collection, id }, (s, args) =>
    copyLocalized(core, s, collectionTarget(collection), args.id, from),
  );

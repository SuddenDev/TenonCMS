import type { Core, Scope } from "../../cms/runtime/types.ts";
import { col } from "../../content/targets.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { copyLocalized } from "../../content/writes/copy-locale.ts";

/** `scope.locale` is the target locale. */
export const copyLocale = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  from: string,
) =>
  run(core, scope, "update", col(collection), { collection, id }, (s, args) =>
    copyLocalized(core, s, col(collection), args.id, from),
  );

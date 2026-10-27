import type { DeleteOptions } from "../../errors.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { remove } from "../../content/writes/remove-document.ts";

export async function deleteDocument(
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  options: DeleteOptions = {},
) {
  return runOperation(
    core,
    scope,
    "delete",
    collectionTarget(collection),
    { collection, id },
    (s, args) => remove(core, s, collection, args.id, options),
  );
}

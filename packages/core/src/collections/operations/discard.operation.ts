import type { DeleteOptions } from "../../errors.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { discard as discardDocument } from "../../content/writes/discard-draft.ts";

export const discard = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  all = false,
  options: DeleteOptions = {},
) => discardDocument(core, scope, collectionTarget(collection), id, all, options);

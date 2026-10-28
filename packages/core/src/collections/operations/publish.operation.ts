import type { Core, Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { publish as publishDocument } from "../../content/writes/publish-document.ts";

export const publish = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  updatedAt?: string,
) => publishDocument(core, scope, collectionTarget(collection), id, updatedAt);

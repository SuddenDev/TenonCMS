import type { Core, Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { unpublish as unpublishDocument } from "../../content/writes/unpublish-document.ts";

export const unpublish = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  updatedAt?: string,
) => unpublishDocument(core, scope, collectionTarget(collection), id, updatedAt);

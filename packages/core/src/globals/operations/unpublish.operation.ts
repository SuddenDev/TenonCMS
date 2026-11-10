import type { Core, Scope } from "../../cms/runtime/types.ts";
import { globalTarget } from "../../content/targets.ts";
import { unpublish as unpublishDocument } from "../../content/writes/unpublish-document.ts";

export const unpublishGlobal = (core: Core, scope: Scope, name: string, updatedAt?: string) =>
  unpublishDocument(core, scope, globalTarget(name), undefined, updatedAt);

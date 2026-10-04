import type { Core, Scope } from "../../cms/runtime/types.ts";
import { col } from "../../content/targets.ts";
import { publish as publishDocument } from "../../content/writes/publish-document.ts";

export const publish = (core: Core, scope: Scope, collection: string, id: string) =>
  publishDocument(core, scope, col(collection), id);

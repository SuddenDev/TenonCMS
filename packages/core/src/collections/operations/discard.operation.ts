import type { Core, Scope } from "../../cms/runtime/types.ts";
import { col } from "../../content/targets.ts";
import { discard as discardDocument } from "../../content/writes/discard-draft.ts";

export const discard = (core: Core, scope: Scope, collection: string, id: string) =>
  discardDocument(core, scope, col(collection), id);

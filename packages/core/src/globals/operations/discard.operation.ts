import type { Core, Scope } from "../../cms/runtime/types.ts";
import { globalTarget } from "../../content/targets.ts";
import { discard as discardDocument } from "../../content/writes/discard-draft.ts";

export const discardGlobal = (core: Core, scope: Scope, name: string, all = false) =>
  discardDocument(core, scope, globalTarget(name), undefined, all);

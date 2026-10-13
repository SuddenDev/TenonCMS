import type { Core, Scope } from "../../cms/runtime/types.ts";
import { glob } from "../../content/targets.ts";
import { discard as discardDocument } from "../../content/writes/discard-draft.ts";

export const discardGlobal = (core: Core, scope: Scope, name: string, all = false) =>
  discardDocument(core, scope, glob(name), undefined, all);

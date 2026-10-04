import type { Core, Scope } from "../../cms/runtime/types.ts";
import { glob } from "../../content/targets.ts";
import { discard as discardDocument } from "../../content/writes/discard-draft.ts";

export const discardGlobal = (core: Core, scope: Scope, name: string) =>
  discardDocument(core, scope, glob(name));

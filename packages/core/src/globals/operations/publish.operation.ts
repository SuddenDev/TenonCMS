import type { Core, Scope } from "../../cms/runtime/types.ts";
import { globalTarget } from "../../content/targets.ts";
import { publish as publishDocument } from "../../content/writes/publish-document.ts";

export const publishGlobal = (core: Core, scope: Scope, name: string) =>
  publishDocument(core, scope, globalTarget(name));

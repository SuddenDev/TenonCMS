import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { globalTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { writeDocument, type WriteMode } from "../../content/writes/write-document.ts";

export const setGlobal = (
  core: Core,
  scope: Scope,
  name: string,
  data: unknown,
  mode: WriteMode = "save",
) =>
  runOperation(
    core,
    scope,
    "setGlobal",
    globalTarget(name),
    { global: name, data, ...(mode === "draft" ? { draft: true } : {}) },
    (s, args) =>
      writeDocument(core, s, {
        target: globalTarget(name),
        operation: "setGlobal",
        input: args.data,
        mode,
      }),
  );

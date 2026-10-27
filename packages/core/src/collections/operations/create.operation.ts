import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { writeDocument } from "../../content/writes/write-document.ts";

export const create = (
  core: Core,
  scope: Scope,
  collection: string,
  data: unknown,
  draft = false,
) =>
  runOperation(
    core,
    scope,
    "create",
    collectionTarget(collection),
    { collection, data, ...(draft ? { draft } : {}) },
    (scope, args) =>
      writeDocument(core, scope, {
        target: collectionTarget(collection),
        operation: "create",
        input: args.data,
        mode: draft ? "draft" : "save",
      }),
  );

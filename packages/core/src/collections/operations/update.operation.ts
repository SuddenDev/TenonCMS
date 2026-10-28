import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { writeDocument, type WriteMode } from "../../content/writes/write-document.ts";

export const update = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  data: unknown,
  mode: WriteMode = "save",
  updatedAt?: string,
) =>
  runOperation(
    core,
    scope,
    "update",
    collectionTarget(collection),
    { collection, id, data, ...(mode === "draft" ? { draft: true } : {}) },
    (s, args) =>
      writeDocument(core, s, {
        target: collectionTarget(collection),
        operation: "update",
        input: args.data,
        id: args.id,
        mode,
        updatedAt,
      }),
  );

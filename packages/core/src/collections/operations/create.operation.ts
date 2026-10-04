import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { col } from "../../content/targets.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { write } from "../../content/writes/write-document.ts";

export const create = (
  core: Core,
  scope: Scope,
  collection: string,
  data: unknown,
  draft = false,
) =>
  run(
    core,
    scope,
    "create",
    col(collection),
    { collection, data, ...(draft ? { draft } : {}) },
    (s, args) => write(core, s, col(collection), "create", args.data, { draft }),
  );

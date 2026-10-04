import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { col } from "../../content/targets.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { write, type WriteFlags } from "../../content/writes/write-document.ts";

export const update = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  data: unknown,
  { effect, draft }: WriteFlags = {},
) =>
  run(
    core,
    scope,
    "update",
    col(collection),
    { collection, id, data, ...(draft ? { draft } : {}) },
    (s, args) =>
      write(core, s, col(collection), "update", args.data, { id: args.id, effect, draft }),
  );

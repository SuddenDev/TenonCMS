import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { glob } from "../../content/targets.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { write, type WriteFlags } from "../../content/writes/write-document.ts";

export const setGlobal = (
  core: Core,
  scope: Scope,
  name: string,
  data: unknown,
  { effect, draft }: WriteFlags = {},
) =>
  run(
    core,
    scope,
    "setGlobal",
    glob(name),
    { global: name, data, ...(draft ? { draft } : {}) },
    (s, args) => write(core, s, glob(name), "setGlobal", args.data, { effect, draft }),
  );

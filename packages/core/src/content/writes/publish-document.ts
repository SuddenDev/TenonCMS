import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { type Name } from "../targets.ts";
import { run } from "../lifecycle/run-operation.ts";
import { write } from "./write-document.ts";

// A publish is an `update` or `setGlobal` of the draft: the whole pipeline runs on `COALESCE(draft, data)`.
export const publish = (core: Core, scope: Scope, name: Name, id?: string) =>
  name.kind === "global"
    ? run(core, scope, "setGlobal", name, { global: name.name }, (s) =>
        write(core, s, name, "setGlobal", {}, { publish: true }),
      )
    : run(core, scope, "update", name, { collection: name.name, id }, (s, args) =>
        write(core, s, name, "update", {}, { id: args.id, publish: true }),
      );

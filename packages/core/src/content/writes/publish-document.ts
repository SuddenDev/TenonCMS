import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { type ContentTarget } from "../targets.ts";
import { runOperation } from "../lifecycle/run-operation.ts";
import { writeDocument } from "./write-document.ts";

/**
 * A publish is an `update` or `setGlobal` of the draft: the whole pipeline runs on `COALESCE(draft, data)`.
 * @returns The published document/global after the operation.
 */
export const publish = (
  core: Core,
  scope: Scope,
  name: ContentTarget,
  id?: string,
  updatedAt?: string,
) => {
  if (name.kind === "global")
    return runOperation(core, scope, "setGlobal", name, { global: name.name }, (s) =>
      writeDocument(core, s, {
        target: name,
        operation: "setGlobal",
        input: {},
        mode: "publish",
        updatedAt,
      }),
    );

  return runOperation(core, scope, "update", name, { collection: name.name, id }, (s, args) =>
    writeDocument(core, s, {
      target: name,
      operation: "update",
      input: {},
      id: args.id,
      mode: "publish",
      updatedAt,
    }),
  );
};

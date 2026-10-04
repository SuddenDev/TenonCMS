import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../schema/hooks/index.ts";
import { deleteDocument } from "../delete.operation.ts";
import { writable } from "./check-writable.ts";

export const deleteLocal =
  (core: Core, scope: Scope): LocalApi["delete"] =>
  async (collection, id) => {
    writable(core, collection);
    await deleteDocument(core, scope, collection, id);
  };

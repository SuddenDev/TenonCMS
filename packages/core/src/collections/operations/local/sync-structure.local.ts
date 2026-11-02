import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { withLocale } from "../../../content/locale.ts";
import {
  applyCollectionSyncStructure,
  setDocumentSyncStructure,
} from "../sync-structure.operation.ts";
import { writable } from "./check-writable.ts";

export const setSyncStructureLocal =
  (core: Core, scope: Scope): LocalApi["setSyncStructure"] =>
  async (collection, id, sync, { locale, dryRun } = {}) => {
    writable(core, collection);
    return setDocumentSyncStructure(
      core,
      withLocale(core, scope, { locale }),
      collection,
      id,
      sync,
      dryRun,
    );
  };

export const applySyncStructureLocal =
  (core: Core, scope: Scope): LocalApi["applySyncStructure"] =>
  async (collection, { dryRun } = {}) => {
    writable(core, collection);
    return applyCollectionSyncStructure(core, scope, collection, dryRun);
  };

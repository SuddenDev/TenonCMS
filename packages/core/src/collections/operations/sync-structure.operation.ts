import type { Core, Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import {
  type SyncChoice,
  applySyncStructure,
  setSyncStructure,
} from "../../content/writes/sync-structure.ts";

/** `scope.locale` is the locale whose structure a switch to on shares. */
export const setDocumentSyncStructure = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  sync: SyncChoice,
  dryRun?: boolean,
) =>
  runOperation(core, scope, "update", collectionTarget(collection), { collection, id }, (s, args) =>
    setSyncStructure(core, s, collectionTarget(collection), args.id, sync, dryRun),
  );

/** Every document follows the collection, in one transaction. */
export const applyCollectionSyncStructure = (
  core: Core,
  scope: Scope,
  collection: string,
  dryRun?: boolean,
) =>
  runOperation(core, scope, "update", collectionTarget(collection), { collection }, (s) =>
    applySyncStructure(core, s, collection, dryRun),
  );

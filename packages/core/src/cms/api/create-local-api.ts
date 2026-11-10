import { trackWrite } from "../runtime/transaction.ts";
import type { Core, Scope } from "../runtime/types.ts";
import type { LocalApi } from "./local-api.ts";
import { jobsApi } from "../../jobs/api.ts";
import { mediaApi } from "../../media/api.ts";
import {
  scheduleGlobalLocal,
  scheduleLocal,
} from "../../schedule/operations/local/schedule.local.ts";
import { findLocal } from "../../collections/operations/local/find.local.ts";
import { findOneLocal } from "../../collections/operations/local/find-one.local.ts";
import { alternatesAtLocal } from "../../collections/operations/local/alternates-at.local.ts";
import { findByIdLocal } from "../../collections/operations/local/find-by-id.local.ts";
import { createLocal } from "../../collections/operations/local/create.local.ts";
import { updateLocal } from "../../collections/operations/local/update.local.ts";
import { publishLocal } from "../../collections/operations/local/publish.local.ts";
import { unpublishLocal } from "../../collections/operations/local/unpublish.local.ts";
import { discardLocal } from "../../collections/operations/local/discard.local.ts";
import { copyLocaleLocal } from "../../collections/operations/local/copy-locale.local.ts";
import { removeLocaleLocal } from "../../collections/operations/local/remove-locale.local.ts";
import { deleteLocal } from "../../collections/operations/local/delete.local.ts";
import { getGlobalLocal } from "../../globals/operations/local/get.local.ts";
import { setGlobalLocal } from "../../globals/operations/local/set.local.ts";
import { publishGlobalLocal } from "../../globals/operations/local/publish.local.ts";
import { unpublishGlobalLocal } from "../../globals/operations/local/unpublish.local.ts";
import { discardGlobalLocal } from "../../globals/operations/local/discard.local.ts";
import { copyGlobalLocaleLocal } from "../../globals/operations/local/copy-locale.local.ts";
import { setGlobalSyncStructureLocal } from "../../globals/operations/local/sync-structure.local.ts";
import {
  applySyncStructureLocal,
  setSyncStructureLocal,
} from "../../collections/operations/local/sync-structure.local.ts";
import { removeGlobalLocaleLocal } from "../../globals/operations/local/remove-locale.local.ts";

/**
 * Creates a local API whose operations use the supplied CMS core and scope.
 *
 * @param core CMS state used to resolve schema, database, and media operations.
 * @param scope Caller context shared by the API's operations.
 * @returns The local API bound to `core` and `scope`.
 */
export function createLocalApi(core: Core, scope: Scope): LocalApi {
  return {
    email: core.email,
    find: findLocal(core, scope),
    findOne: findOneLocal(core, scope),
    findById: findByIdLocal(core, scope),
    alternatesAt: alternatesAtLocal(core, scope),
    create: trackWrite(scope, createLocal(core, scope)),
    update: trackWrite(scope, updateLocal(core, scope)),
    publish: trackWrite(scope, publishLocal(core, scope)),
    unpublish: trackWrite(scope, unpublishLocal(core, scope)),
    schedule: trackWrite(scope, scheduleLocal(core, scope)),
    discard: trackWrite(scope, discardLocal(core, scope)),
    copyLocale: trackWrite(scope, copyLocaleLocal(core, scope)),
    removeLocale: trackWrite(scope, removeLocaleLocal(core, scope)),
    setSyncStructure: trackWrite(scope, setSyncStructureLocal(core, scope)),
    applySyncStructure: trackWrite(scope, applySyncStructureLocal(core, scope)),
    delete: trackWrite(scope, deleteLocal(core, scope)),
    getGlobal: getGlobalLocal(core, scope),
    setGlobal: trackWrite(scope, setGlobalLocal(core, scope)),
    publishGlobal: trackWrite(scope, publishGlobalLocal(core, scope)),
    unpublishGlobal: trackWrite(scope, unpublishGlobalLocal(core, scope)),
    scheduleGlobal: trackWrite(scope, scheduleGlobalLocal(core, scope)),
    discardGlobal: trackWrite(scope, discardGlobalLocal(core, scope)),
    copyGlobalLocale: trackWrite(scope, copyGlobalLocaleLocal(core, scope)),
    removeGlobalLocale: trackWrite(scope, removeGlobalLocaleLocal(core, scope)),
    setGlobalSyncStructure: trackWrite(scope, setGlobalSyncStructureLocal(core, scope)),
    withDrafts: () => core.localApi({ ...scope, perspective: "drafts" }),
    jobs: jobsApi(core, scope),
    media: core.media && mediaApi(core, scope),
  };
}

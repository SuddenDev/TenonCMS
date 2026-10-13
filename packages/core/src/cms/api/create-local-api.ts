import type { Core, Scope } from "../runtime/types.ts";
import type { LocalApi } from "./local-api.ts";
import { mediaApi } from "../../media/api.ts";
import { findLocal } from "../../collections/operations/local/find.local.ts";
import { findOneLocal } from "../../collections/operations/local/find-one.local.ts";
import { alternatesAtLocal } from "../../collections/operations/local/alternates-at.local.ts";
import { findByIdLocal } from "../../collections/operations/local/find-by-id.local.ts";
import { createLocal } from "../../collections/operations/local/create.local.ts";
import { updateLocal } from "../../collections/operations/local/update.local.ts";
import { publishLocal } from "../../collections/operations/local/publish.local.ts";
import { discardLocal } from "../../collections/operations/local/discard.local.ts";
import { copyLocaleLocal } from "../../collections/operations/local/copy-locale.local.ts";
import { removeLocaleLocal } from "../../collections/operations/local/remove-locale.local.ts";
import { deleteLocal } from "../../collections/operations/local/delete.local.ts";
import { getGlobalLocal } from "../../globals/operations/local/get.local.ts";
import { setGlobalLocal } from "../../globals/operations/local/set.local.ts";
import { publishGlobalLocal } from "../../globals/operations/local/publish.local.ts";
import { discardGlobalLocal } from "../../globals/operations/local/discard.local.ts";
import { copyGlobalLocaleLocal } from "../../globals/operations/local/copy-locale.local.ts";
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
    find: findLocal(core, scope),
    findOne: findOneLocal(core, scope),
    findById: findByIdLocal(core, scope),
    alternatesAt: alternatesAtLocal(core, scope),
    create: createLocal(core, scope),
    update: updateLocal(core, scope),
    publish: publishLocal(core, scope),
    discard: discardLocal(core, scope),
    copyLocale: copyLocaleLocal(core, scope),
    removeLocale: removeLocaleLocal(core, scope),
    delete: deleteLocal(core, scope),
    getGlobal: getGlobalLocal(core, scope),
    setGlobal: setGlobalLocal(core, scope),
    publishGlobal: publishGlobalLocal(core, scope),
    discardGlobal: discardGlobalLocal(core, scope),
    copyGlobalLocale: copyGlobalLocaleLocal(core, scope),
    removeGlobalLocale: removeGlobalLocaleLocal(core, scope),
    withDrafts: () => core.localApi({ ...scope, perspective: "drafts" }),
    media: core.media && mediaApi(core, scope),
  };
}

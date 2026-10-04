import type { Core, Scope } from "../runtime/types.ts";
import type { LocalApi } from "../../schema/hooks/index.ts";
import { mediaApi } from "../../media/api.ts";
import { findLocal } from "../../collections/operations/local/find.local.ts";
import { findOneLocal } from "../../collections/operations/local/find-one.local.ts";
import { findByIdLocal } from "../../collections/operations/local/find-by-id.local.ts";
import { createLocal } from "../../collections/operations/local/create.local.ts";
import { updateLocal } from "../../collections/operations/local/update.local.ts";
import { publishLocal } from "../../collections/operations/local/publish.local.ts";
import { discardLocal } from "../../collections/operations/local/discard.local.ts";
import { deleteLocal } from "../../collections/operations/local/delete.local.ts";
import { getGlobalLocal } from "../../globals/operations/local/get.local.ts";
import { setGlobalLocal } from "../../globals/operations/local/set.local.ts";
import { publishGlobalLocal } from "../../globals/operations/local/publish.local.ts";
import { discardGlobalLocal } from "../../globals/operations/local/discard.local.ts";

/** The local API of one scope. The implementation is untyped; `Api` types it for the host. */
export function bind(core: Core, scope: Scope): LocalApi {
  return {
    find: findLocal(core, scope),
    findOne: findOneLocal(core, scope),
    findById: findByIdLocal(core, scope),
    create: createLocal(core, scope),
    update: updateLocal(core, scope),
    publish: publishLocal(core, scope),
    discard: discardLocal(core, scope),
    delete: deleteLocal(core, scope),
    getGlobal: getGlobalLocal(core, scope),
    setGlobal: setGlobalLocal(core, scope),
    publishGlobal: publishGlobalLocal(core, scope),
    discardGlobal: discardGlobalLocal(core, scope),
    drafts: () => core.bind({ ...scope, drafts: true }),
    media: core.media && mediaApi(core, scope),
  };
}

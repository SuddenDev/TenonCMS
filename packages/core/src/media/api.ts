import type { Core, Scope } from "../cms/runtime/types.ts";
import type { MediaApi } from "../schema/hooks/media.ts";
import { removeMedia } from "./operations/delete.operation.ts";
import { renameFolder } from "./operations/rename-folder.operation.ts";
import { update } from "./operations/update/update.operation.ts";
import { upload } from "./operations/uploads/upload.operation.ts";
import { regenerate } from "./operations/regenerate.operation.ts";

/** `cms.media` of one scope. */
export const mediaApi = (core: Core, scope: Scope) =>
  ({
    upload: (data, info) => upload(core, scope, data, info),
    update: (id, data) => update(core, scope, id, data),
    renameFolder: (from, to) => renameFolder(core, scope, from, to),
    delete: (id, options) => removeMedia(core, scope, id, options),
    regenerate: (id, options) => regenerate(core, scope, id, options),
  }) satisfies MediaApi as MediaApi;

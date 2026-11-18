import { trackWrite } from "../cms/runtime/transaction.ts";
import type { Core, Scope } from "../cms/runtime/types.ts";
import type { MediaApi } from "../schema/hooks/media.ts";
import { removeMedia } from "./operations/delete.operation.ts";
import { renameFolder } from "./operations/rename-folder.operation.ts";
import { update } from "./operations/update/update.operation.ts";
import { upload } from "./operations/uploads/upload.operation.ts";
import { regenerate } from "./operations/regenerate.operation.ts";
import { setThumbnail } from "./operations/set-thumbnail.operation.ts";

/** `cms.media` of one scope. */
export const mediaApi = (core: Core, scope: Scope) =>
  ({
    upload: trackWrite(scope, (data, info) => upload(core, scope, data, info)),
    update: trackWrite(scope, (id, data) => update(core, scope, id, data)),
    renameFolder: trackWrite(scope, (from, to) => renameFolder(core, scope, from, to)),
    delete: trackWrite(scope, (id, options) => removeMedia(core, scope, id, options)),
    regenerate: trackWrite(scope, (id, options) => regenerate(core, scope, id, options)),
    setThumbnail: trackWrite(scope, (id, data) => setThumbnail(core, scope, id, data)),
  }) satisfies MediaApi as MediaApi;

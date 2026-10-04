import type { Core, Scope } from "../cms/runtime/types.ts";
import type { MediaApi } from "../schema/hooks/media.ts";
import { removeMedia, renameFolder, update } from "./library.ts";
import { upload } from "./upload.ts";
import { regenerate } from "./variants.ts";

/** `cms.media` of one scope. */
export const mediaApi = (core: Core, scope: Scope) =>
  ({
    upload: (data, info) => upload(core, scope, data, info),
    update: (id, data) => update(core, scope, id, data),
    renameFolder: (from, to) => renameFolder(core, scope, from, to),
    delete: (id) => removeMedia(core, scope, id),
    regenerate: (id, options) => regenerate(core, scope, id, options),
  }) satisfies MediaApi as MediaApi;

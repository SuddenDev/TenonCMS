import type { Core, Scope } from "../../cms/runtime/types.ts";
import { requireAdmin } from "../access.ts";
import type { ImportMode } from "../format.ts";
import { exportContent } from "../operations/export.operation.ts";
import { importContent } from "../operations/import.operation.ts";

/** `cms.export()`: all content as a ZIP archive. `media: false` leaves the media files out. */
export const exportLocal =
  (core: Core, scope: Scope) =>
  async (options: { media?: boolean } = {}) => {
    requireAdmin(scope);
    return exportContent(core, scope, options);
  };

/** `cms.import()`: writes an archive of `cms.export()`. */
export const importLocal =
  (core: Core, scope: Scope) =>
  async (archive: Blob, options: { mode?: ImportMode } = {}) => {
    requireAdmin(scope);
    return importContent(core, scope, archive, options);
  };

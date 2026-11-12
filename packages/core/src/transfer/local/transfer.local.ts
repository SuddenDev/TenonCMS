import type { Core, Scope } from "../../cms/runtime/types.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { requireBackup } from "../access.ts";
import type { ExportOptions, ImportOptions } from "../format.ts";
import { countArchive } from "../operations/count-archive.ts";
import { exportContent } from "../operations/export.operation.ts";
import { importContent } from "../operations/import.operation.ts";

/** `cms.export()`: all content as a ZIP archive. `media: false` leaves the media files out. */
export const exportLocal =
  (core: Core, scope: Scope) =>
  async (options: ExportOptions = {}) => {
    requireBackup(scope, "read");
    return exportContent(core, scope, options);
  };

/** `cms.exportSummary()`: what `cms.export()` with the same options would hold. */
export const exportSummaryLocal =
  (core: Core, scope: Scope) =>
  async (options: ExportOptions = {}) => {
    requireBackup(scope, "read");
    return countArchive(core, await databaseForScope(core, scope), options);
  };

/** `cms.import()`: writes an archive of `cms.export()`, or checks it with `dryRun`. */
export const importLocal =
  (core: Core, scope: Scope) =>
  async (archive: Blob, options: ImportOptions = {}) => {
    requireBackup(scope, "update");
    return importContent(core, scope, archive, options as never);
  };

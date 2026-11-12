import { API_BASE } from "../../client/constants.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import type { Storage } from "../../media/storage/types.ts";
import { writeFile } from "../../media/storage/write-file.ts";
import { requireBackup } from "../access.ts";
import { EXPORTS, type ExportOptions, ZIP, archiveName, exportQuery } from "../format.ts";
import { exportContent } from "./export.operation.ts";

// How long a download link of a staged export works, in milliseconds.
const LINK_LIFETIME = 12 * 60 * 60 * 1000;

/**
 * A link that downloads the archive of `exportContent()`. With direct downloads (S3), the archive is written into media
 * storage first, so the download skips the host's response size limit. Staged exports older than the link's lifetime
 * are deleted here. Otherwise the link is `GET /export`, which streams the archive.
 */
export async function stageExport(core: Core, scope: Scope, options: ExportOptions = {}) {
  requireBackup(scope, "read");
  const storage = core.media?.storage;
  if (!storage?.downloadUrl) return `${API_BASE}/export${exportQuery(options)}`;

  await removeOldExports(storage);
  const key = `${EXPORTS}/${Date.now()}-${crypto.randomUUID()}.zip`;
  await writeFile(storage, key, await exportContent(core, scope, options), ZIP);
  return storage.downloadUrl(key, archiveName(), LINK_LIFETIME / 1000);
}

// Keys start with the time of the export.
async function removeOldExports(storage: Storage) {
  for (const key of await storage.list(`${EXPORTS}/`)) {
    const time = Number(key.slice(EXPORTS.length + 1).split("-")[0]);
    if (!(time > Date.now() - LINK_LIFETIME)) await storage.delete(key);
  }
}

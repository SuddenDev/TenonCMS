import { consola } from "consola";
import { actorId } from "../../cms/runtime/operation-context.ts";
import { databaseForScope, onRollback, transaction } from "../../cms/runtime/transaction.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { ValidationError } from "../../errors.ts";
import { effectivePartSize, partUrls, partsOf } from "../../media/operations/uploads/parts.ts";
import { removeExpired } from "../../media/operations/uploads/remove-expired.ts";
import { DAY, deleteUpload, type Row } from "../../media/operations/uploads/upload-row.ts";
import { mediaOf } from "../../media/runtime/create-media-core.ts";
import type { Storage } from "../../media/storage/types.ts";
import { requireBackup } from "../access.ts";
import { IMPORTS, type ImportMode, ZIP } from "../format.ts";
import type { ZipSource } from "../read-zip.ts";
import { importContent } from "./import.operation.ts";

// An archive bigger than a host's request limit goes into media storage first, through the steps of a media upload:
// `createImportUpload`, then `putPart()` per part (proxied storage only), then `completeImportUpload` or `abort()`. Its
// row in `cms_uploads` sits in the dot folder `IMPORTS`, so the media routes never find it.

/**
 * Starts the upload of an archive of `size` bytes into media storage.
 * @returns The upload id, the part size and one URL per part.
 * @throws {ValidationError} For a size that is not a positive whole number.
 */
export async function createImportUpload(core: Core, scope: Scope, input: { size?: unknown }) {
  requireBackup(scope, "update");
  const size = input.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1)
    throw new ValidationError({ size: "MUST be the size of the archive in bytes" });
  const { storage } = mediaOf(core);

  return transaction(core, scope, async (s) => {
    const db = await databaseForScope(core, s);
    await removeExpired(storage, db);

    const id = crypto.randomUUID();
    const filename = `${id}.zip`;
    const key = `${IMPORTS}/${filename}`;
    const partSize = effectivePartSize(size, storage.partSize);
    const parts = partsOf({ size, part_size: partSize });
    const { uploadId } = await storage.createUpload(key, { size, mimeType: ZIP, parts });
    onRollback(s, () => storage.abort(key, uploadId));

    await db
      .insertInto("cms_uploads")
      .values({
        id,
        key,
        folder: IMPORTS,
        filename,
        mime_type: ZIP,
        size,
        part_size: partSize,
        adapter_upload_id: uploadId,
        user_id: actorId(scope),
        created_at: Date.now(),
      })
      .execute();

    const route = `/import/uploads/${id}`;
    return { id, partSize, parts: await partUrls(storage, { key, uploadId, parts }, route) };
  });
}

/** The import upload `id` of the scope's admin, or `undefined` for an unknown, expired or foreign one. */
export async function findImportUpload(core: Core, scope: Scope, id: string) {
  requireBackup(scope, "update");
  const db = await databaseForScope(core, scope);
  const row = await db
    .selectFrom("cms_uploads")
    .selectAll()
    .where("id", "=", id)
    .where("folder", "=", IMPORTS)
    .executeTakeFirst();
  const mine = row && row.user_id === actorId(scope);
  return mine && row.created_at > Date.now() - DAY ? row : undefined;
}

/**
 * Assembles the archive and imports it like `cms.import()`. The archive is read from storage piece by piece. It and
 * the upload row are deleted afterwards, also when the import fails.
 */
export async function completeImportUpload(
  core: Core,
  scope: Scope,
  row: Row,
  parts: { n: number; etag: string }[],
  options: { mode?: ImportMode },
) {
  const { storage } = mediaOf(core);
  try {
    await storage.complete(row.key, row.adapter_upload_id, parts);
    return await importContent(core, scope, await storedArchive(storage, row.key), options);
  } finally {
    // After a complete, the abort finds nothing. After a failed one, it drops the parts.
    await storage.abort(row.key, row.adapter_upload_id).catch(() => {});
    await storage.delete(row.key).catch((e) => consola.withTag("tenon").error(e));
    await deleteUpload(await databaseForScope(core, scope), row.id);
  }
}

// A stored file as a `ZipSource`: each read is a range request.
async function storedArchive(storage: Storage, key: string): Promise<ZipSource> {
  const head = await storage.get(key, { start: 0, end: 0 });
  if (!head) throw new ValidationError({ archive: "The uploaded archive is missing" });
  await head.body.cancel();
  return {
    size: head.size,
    async read(start, end) {
      const file = end > start ? await storage.get(key, { start, end: end - 1 }) : undefined;
      return file?.body ?? new Blob([]).stream();
    },
  };
}

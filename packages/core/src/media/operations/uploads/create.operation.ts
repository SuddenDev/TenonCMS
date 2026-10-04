import { consola } from "consola";
import type { Kysely } from "kysely";
import { API_BASE } from "../../../client/index.ts";
import type { Core, Inner, Scope } from "../../../cms/runtime/types.ts";
import { transaction } from "../../../cms/runtime/transaction.ts";
import type { Database } from "../../../db/types.ts";
import { ValidationError } from "../../../errors.ts";
import type { UploadInfo } from "../../../schema/index.ts";
import { type MediaCore, mediaOf } from "../../runtime/create-media-core.ts";
import { runMediaHooks } from "../../runtime/run-media-hooks.ts";
import { namesIn } from "../../library/names-in.ts";
import { accepts, cleanFolder, cleanName, freeName, keyOf } from "../../library/names.ts";
import type { Storage } from "../../storage/types.ts";
import { DAY, effectivePartSize, partsOf } from "./upload-data.ts";

const log = consola.withTag("integral");

// Aborts uploads older than a day and deletes their rows. A failed abort is logged; the row goes anyway.
async function cleanup(storage: Storage, db: Kysely<Database>) {
  const old = await db
    .selectFrom("cms_uploads")
    .selectAll()
    .where("created_at", "<", Date.now() - DAY)
    .execute();
  for (const row of old) {
    await storage.abort(row.key, row.adapter_upload_id).catch((e) => log.error(e));
    await db.deleteFrom("cms_uploads").where("id", "=", row.id).execute();
  }
}

// Throws a `ValidationError` for a size or type the options reject.
function checkFile(media: MediaCore, { size, mimeType }: Partial<UploadInfo>) {
  if (!Number.isSafeInteger(size) || size! < 1)
    throw new ValidationError({ size: "MUST be a positive number of bytes" });
  if (size! > media.maxSize)
    throw new ValidationError({ size: `Larger than ${media.maxSize} bytes` });
  if (typeof mimeType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType))
    throw new ValidationError({ mimeType: "Invalid type" });
  if (!accepts(media.accept, mimeType)) throw new ValidationError({ mimeType: "Type not allowed" });
  return { size: size!, mimeType };
}

const cleanPlace = (info: Partial<UploadInfo>) => ({
  folder: cleanFolder(String(info.folder ?? "")),
  filename: cleanName(String(info.filename ?? "")),
});

// Runs `beforeUpload` and returns the folder and a filename no other file in it uses.
async function placeFile(core: Core, s: Inner, info: UploadInfo) {
  const hooked = await runMediaHooks(core, s, "beforeUpload", "data", info);
  const { folder, filename } = cleanPlace(hooked);
  return { folder, filename: freeName(await namesIn(s.trx!, folder), filename) };
}

// One URL per part: presigned for direct storage, the part route for proxied storage.
const partUrls = (storage: Storage, id: string, key: string, uploadId: string, parts: number) =>
  Promise.all(
    Array.from({ length: parts }, async (_, i) => ({
      n: i + 1,
      url: storage.partUrl
        ? await storage.partUrl(key, uploadId, i + 1, DAY / 1000)
        : `${API_BASE}/media/uploads/${id}/parts/${i + 1}`,
    })),
  );

/**
 * Step 1: checks the file, runs `beforeUpload`, reserves a free key and starts the upload in storage.
 * Returns the upload id, the part size and one URL per part.
 */
export async function create(core: Core, scope: Scope, input: Partial<UploadInfo>) {
  const media = mediaOf(core);
  const { storage } = media;
  const { size, mimeType } = checkFile(media, input);
  return transaction(core, scope, async (s) => {
    const db = s.trx!;
    await cleanup(storage, db);
    const { folder, filename } = await placeFile(core, s, { ...cleanPlace(input), mimeType, size });
    const key = keyOf(folder, filename);
    const partSize = effectivePartSize(size, storage.partSize);
    const parts = partsOf({ size, part_size: partSize });
    const { uploadId } = await storage.createUpload(key, { size, mimeType, parts });
    const id = crypto.randomUUID();
    await db
      .insertInto("cms_uploads")
      .values({
        id,
        key,
        folder,
        filename,
        mime_type: mimeType,
        size,
        part_size: partSize,
        adapter_upload_id: uploadId,
        user_id: scope.user?.id ?? null,
        created_at: Date.now(),
      })
      .execute();
    return { id, partSize, parts: await partUrls(storage, id, key, uploadId, parts) };
  });
}

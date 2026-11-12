import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { databaseForScope, onRollback, transaction } from "../../../cms/runtime/transaction.ts";
import { actorId } from "../../../cms/runtime/operation-context.ts";
import type { UploadInfo } from "../../../schema/index.ts";
import { keyOf } from "../../library/names.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { checkFile } from "./check-file.ts";
import { effectivePartSize, partUrls, partsOf } from "./parts.ts";
import { cleanPlace, placeFile } from "./place-file.ts";
import { removeExpired } from "./remove-expired.ts";
import { collectionTarget } from "../../../content/targets.ts";
import { guard } from "../../../access/rule.ts";

/**
 * Step 1: checks the file, runs `beforeUpload`, reserves a free key and starts the upload in storage.
 * Returns the upload id, the part size and one URL per part.
 * @throws {ForbiddenError} When `media.access.create` denies, before any byte is stored.
 */
export async function create(core: Core, scope: Scope, input: Partial<UploadInfo>) {
  const media = mediaOf(core);
  const { storage } = media;
  return transaction(core, scope, async (s) => {
    const { size, mimeType } = checkFile(media, input);
    await guard(core, s, collectionTarget("media"), "create", { data: input });
    const db = await databaseForScope(core, s);
    await removeExpired(storage, db);

    const { folder, filename } = await placeFile(core, s, { ...cleanPlace(input), mimeType, size });
    const key = keyOf(folder, filename);
    const partSize = effectivePartSize(size, storage.partSize);
    const parts = partsOf({ size, part_size: partSize });
    const { uploadId } = await storage.createUpload(key, { size, mimeType, parts });

    onRollback(s, () => storage.abort(key, uploadId));

    // The row reserves the key: `namesIn()` counts unfinished uploads.
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
        user_id: actorId(scope),
        created_at: Date.now(),
      })
      .execute();

    return {
      id,
      partSize,
      parts: await partUrls(storage, { key, uploadId, parts }, `/media/uploads/${id}`),
    };
  });
}

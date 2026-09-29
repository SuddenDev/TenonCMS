import { consola } from "consola";
import type { Kysely, Selectable } from "kysely";
import { API_BASE } from "../client/index.ts";
import { col, type Core, type Inner, q, type Scope, transaction } from "../cms/scope.ts";
import { write } from "../cms/write.ts";
import type { Database } from "../db/index.ts";
import { ValidationError } from "../errors.ts";
import type { UploadInfo } from "../schema/index.ts";
import { type MediaCore, mediaOf, read, runMediaHooks } from "./core.ts";
import { dimensions } from "./dimensions.ts";
import { hasVariants } from "./images.ts";
import { namesIn } from "./library.ts";
import { accepts, cleanFolder, cleanName, freeName, keyOf } from "./names.ts";
import type { Storage } from "./storage/types.ts";
import { renderAll } from "./variants.ts";

// An upload takes four steps, each its own request: `create`, `putPart` per part (proxied storage only), then
// `complete` or `abort`. `upload()` runs them in one call for the local API.

type Row = Selectable<Database["cms_uploads"]>;

const DAY = 24 * 60 * 60 * 1000;
// Bytes read for the image header. Some JPEGs carry large metadata before their size.
const HEADER = 1024 ** 2;
const log = consola.withTag("integral");

/** The part size of one upload: the adapter's, raised until there are at most 10000 parts, the S3 limit. */
export const effectivePartSize = (size: number, partSize: number) =>
  Math.max(partSize, Math.ceil(size / 10_000));

const partsOf = (row: Pick<Row, "size" | "part_size">) =>
  Math.max(1, Math.ceil(row.size / row.part_size));

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

/** The upload `id` of the scope's user, or `undefined` for an unknown, expired or foreign one. */
export async function uploadOf(core: Core, scope: Scope, id: string) {
  const row = await (
    await q(core, scope)
  )
    .selectFrom("cms_uploads")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  const mine = row && row.user_id === (scope.user?.id ?? null);
  return mine && row.created_at > Date.now() - DAY ? row : undefined;
}

/** The byte length part `n` MUST have. Throws for `n` out of range. */
function partLength(row: Row, n: number) {
  const parts = partsOf(row);
  if (!Number.isInteger(n) || n < 1 || n > parts) throw new ValidationError({ n: "Out of range" });
  return n < parts ? row.part_size : row.size - (parts - 1) * row.part_size;
}

/** Step 2 for proxied uploads: streams part `n` into storage. Parts MAY come out of order or twice. */
export async function putPart(core: Core, row: Row, n: number, body: ReadableStream<Uint8Array>) {
  const { storage } = mediaOf(core);
  if (!storage.putPart) throw new ValidationError({ n: "This storage takes parts directly" });
  const expected = partLength(row, n);
  let count = 0;
  const counted = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        count += chunk.length;
        if (count > expected) controller.error(new Error("Part too large"));
        else controller.enqueue(chunk);
      },
    }),
  );
  const wrong = () => new ValidationError({ n: `Part ${n} MUST have ${expected} bytes` });
  const result = await storage
    .putPart(row.key, row.adapter_upload_id, n, counted, row.part_size)
    .catch((error) => {
      throw count > expected ? wrong() : error;
    });
  if (count !== expected) throw wrong();
  return result;
}

// Drops the stored file and the upload row after a failed `complete`.
async function discard(core: Core, scope: Scope, row: Row) {
  await mediaOf(core)
    .storage.delete(row.key)
    .catch((e) => log.error(e));
  await (await q(core, scope)).deleteFrom("cms_uploads").where("id", "=", row.id).execute();
}

// The document data of a stored upload. Throws when the size is off or an image has no readable header.
async function fileData(storage: Storage, row: Row, size: number) {
  if (size !== row.size)
    throw new ValidationError({ size: `Received ${size} bytes, expected ${row.size}` });
  const data = {
    folder: row.folder,
    filename: row.filename,
    key: row.key,
    mimeType: row.mime_type,
    size,
  };
  if (!row.mime_type.startsWith("image/")) return data;
  const head = await storage.get(row.key, { start: 0, end: Math.min(size, HEADER) - 1 });
  const found = head && dimensions(await new Response(head.body).bytes());
  if (!found) throw new ValidationError({ "": "Not a valid image" });
  return { ...data, ...found };
}

// Creates the document, runs `afterUpload` and deletes the upload row.
async function createDoc(core: Core, s: Inner, row: Row, data: Record<string, unknown>) {
  const { storage } = mediaOf(core);
  const doc = (await write(core, s, col("media"), "create", data))!;
  const readFile = async () => (await storage.get(row.key))!.body;
  await runMediaHooks(core, s, "afterUpload", "doc", doc, { read: readFile });
  await s.trx!.deleteFrom("cms_uploads").where("id", "=", row.id).execute();
  return doc;
}

/**
 * Step 3: assembles the file, checks its size and image header, then creates the document, runs `afterUpload` and deletes
 * the upload row in one transaction. On failure the file and the row go. Renders variants after commit when the
 * provider prerenders; a failed variant is logged and renders on first request instead.
 */
export async function complete(
  core: Core,
  scope: Scope,
  row: Row,
  parts: { n: number; etag: string }[],
) {
  const media = mediaOf(core);
  const { size } = await media.storage.complete(row.key, row.adapter_upload_id, parts);
  let doc: Record<string, any>;
  try {
    const data = await fileData(media.storage, row, size);
    doc = await transaction(core, scope, (s) => createDoc(core, s, row, data));
  } catch (error) {
    await discard(core, scope, row);
    throw error;
  }
  if (media.images?.provider.prerender && hasVariants(media.images, doc))
    await renderAll(media, doc.key, media.allowlist.keys());
  return read(core, doc);
}

/** Step 4: drops an unfinished upload. */
export async function abort(core: Core, scope: Scope, row: Row) {
  await mediaOf(core).storage.abort(row.key, row.adapter_upload_id);
  await (await q(core, scope)).deleteFrom("cms_uploads").where("id", "=", row.id).execute();
}

// Splits bytes or a stream into parts of `partSize` bytes. A stream part is buffered in memory, copied once.
async function* chunks(data: Uint8Array | ReadableStream<Uint8Array>, partSize: number) {
  if (data instanceof Uint8Array) {
    for (let i = 0; i < data.length; i += partSize) yield data.subarray(i, i + partSize);
    return;
  }
  let pending: Uint8Array[] = [];
  let length = 0;
  const flush = () => {
    const part = new Uint8Array(length);
    let offset = 0;
    for (const p of pending) {
      part.set(p, offset);
      offset += p.length;
    }
    pending = [];
    length = 0;
    return part;
  };
  for await (let chunk of data as unknown as AsyncIterable<Uint8Array>) {
    while (length + chunk.length >= partSize) {
      const take = partSize - length;
      pending.push(chunk.subarray(0, take));
      length = partSize;
      yield flush();
      chunk = chunk.subarray(take);
    }
    if (!chunk.length) continue;
    pending.push(chunk);
    length += chunk.length;
  }
  if (length) yield flush();
}

/** `cms.media.upload()`: steps 1 to 4 without HTTP. With `partUrl` storage, parts go to the presigned URLs. */
export async function upload(
  core: Core,
  scope: Scope,
  data: Uint8Array | ReadableStream<Uint8Array>,
  info: { filename: string; mimeType: string; folder?: string; size?: number },
) {
  const size = data instanceof Uint8Array ? data.length : info.size;
  const plan = await create(core, scope, { ...info, size });
  const row = (await uploadOf(core, scope, plan.id))!;
  try {
    const etags: { n: number; etag: string }[] = [];
    let n = 0;
    for await (const part of chunks(data, plan.partSize)) {
      n++;
      if (mediaOf(core).storage.putPart) {
        etags.push({ n, ...(await putPart(core, row, n, new Blob([part as BlobPart]).stream())) });
        continue;
      }
      const res = await fetch(plan.parts[n - 1].url, { method: "PUT", body: part as BodyInit });
      if (!res.ok) throw new Error(`Uploading part ${n} failed: ${res.status}`);
      etags.push({ n, etag: res.headers.get("etag") ?? "" });
    }
    return await complete(core, scope, row, etags);
  } catch (error) {
    await abort(core, scope, row).catch(() => {});
    throw error;
  }
}

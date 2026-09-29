import { consola } from "consola";
import type { Kysely, Selectable } from "kysely";
import { API_BASE } from "../client/index.ts";
import { col, type Core, hookArgs, type Inner, inner, q, type Scope } from "../cms/scope.ts";
import { write } from "../cms/write.ts";
import { findDocs, loadDoc } from "../db/documents.ts";
import type { Database } from "../db/index.ts";
import { ValidationError } from "../errors.ts";
import { runHooks } from "../schema/hooks/run.ts";
import type { MediaDoc, Modifiers, UploadInfo } from "../schema/index.ts";
import { dimensions } from "./dimensions.ts";
import { decorate, hasVariants } from "./images.ts";
import { type MediaCore, mediaSlot } from "./index.ts";
import type { Storage } from "./storage/types.ts";
import { accepts, cleanFolder, cleanName, freeName, keyOf } from "./names.ts";

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

/** The media core, or an error for an instance without `media`. */
export function mediaOf(core: Core): MediaCore {
  if (!core.media) throw new Error("integral-cms: the `media` option is not set");
  return core.media;
}

/** Runs `fn` in the scope's transaction, or in a new one. Hooks inside share it, like other writes. */
export async function tx<R>(core: Core, scope: Scope, fn: (s: Inner) => Promise<R>): Promise<R> {
  const context = scope.nested ? scope.context : {};
  if (scope.trx) return fn(inner(core, scope, scope.trx, context));
  return (await core.db()).transaction().execute((trx) => fn(inner(core, scope, trx, context)));
}

/** Args of a media hook. */
export const mediaArgs = <E extends object>(s: Inner, extra: E) => hookArgs(s, col("media"), extra);

/** A media document with `url`, and `src` / `srcset` for images, with the global image options. */
export const read = (core: Core, doc: Record<string, any>) =>
  decorate(mediaOf(core), doc) as MediaDoc & { url: string };

const VARIANTS = ".variants/";

/** Where the variant `id` (a modifier id) of the file `key` lives. */
export const variantKey = (key: string, id: string) => `${VARIANTS}${key}/${id}`;

/** The modifier ids of the stored variants of `key`. Deeper keys belong to files in a folder named like `key`. */
export async function variantsOf(storage: Storage, key: string) {
  const prefix = `${VARIANTS}${key}/`;
  return (await storage.list(prefix))
    .map((k) => k.slice(prefix.length))
    .filter((id) => !id.includes("/"));
}

// Aborts uploads older than a day and deletes their rows. A failed abort is logged; the row goes anyway.
async function cleanup(core: Core, db: Kysely<Database>) {
  const { storage } = mediaOf(core);
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

/** Filenames used in `folder`, by media documents and by uploads in progress. */
export async function namesIn(db: Kysely<Database>, folder: string) {
  // ponytail: loads every document of the folder. Add a SQL filter on filename if folders grow large.
  const docs = await findDocs(db, "media", { where: { folder } });
  const uploads = await db
    .selectFrom("cms_uploads")
    .select("filename")
    .where("folder", "=", folder)
    .execute();
  return [...docs.map((d) => String(d.filename)), ...uploads.map((u) => u.filename)];
}

/**
 * Step 1: checks the file, runs `beforeUpload`, reserves a free key and starts the upload in storage.
 * Returns the upload id, the part size and one URL per part.
 */
export async function create(core: Core, scope: Scope, input: Partial<UploadInfo>) {
  const media = mediaOf(core);
  const { size, mimeType } = input;
  if (!Number.isSafeInteger(size) || size! < 1)
    throw new ValidationError({ size: "MUST be a positive number of bytes" });
  if (size! > media.maxSize)
    throw new ValidationError({ size: `Larger than ${media.maxSize} bytes` });
  if (typeof mimeType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType))
    throw new ValidationError({ mimeType: "Invalid type" });
  if (!accepts(media.accept, mimeType)) throw new ValidationError({ mimeType: "Type not allowed" });
  const clean = (info: Partial<UploadInfo>) => ({
    folder: cleanFolder(String(info.folder ?? "")),
    filename: cleanName(String(info.filename ?? "")),
  });

  return tx(core, scope, async (s) => {
    const db = s.trx!;
    await cleanup(core, db);
    const info = { ...clean(input), mimeType, size: size! };
    const hooked = await runHooks(mediaSlot(core, "beforeUpload"), "data", info, mediaArgs(s, {}));
    const { folder, filename: wanted } = clean(hooked);
    const filename = freeName(await namesIn(db, folder), wanted);
    const key = keyOf(folder, filename);
    const partSize = effectivePartSize(size!, media.storage.partSize);
    const parts = partsOf({ size: size!, part_size: partSize });
    const { uploadId } = await media.storage.createUpload(key, { size: size!, mimeType, parts });
    const id = crypto.randomUUID();
    await db
      .insertInto("cms_uploads")
      .values({
        id,
        key,
        folder,
        filename,
        mime_type: mimeType,
        size: size!,
        part_size: partSize,
        adapter_upload_id: uploadId,
        user_id: scope.user?.id ?? null,
        created_at: Date.now(),
      })
      .execute();
    const urls = await Promise.all(
      Array.from({ length: parts }, async (_, i) => ({
        n: i + 1,
        url: media.storage.partUrl
          ? await media.storage.partUrl(key, uploadId, i + 1, DAY / 1000)
          : `${API_BASE}/media/uploads/${id}/parts/${i + 1}`,
      })),
    );
    return { id, partSize, parts: urls };
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

/**
 * Step 3: assembles the file, checks its size and image header, then creates the document, runs `afterUpload` and deletes
 * the upload row in one transaction. Renders variants after commit when the provider prerenders.
 */
export async function complete(
  core: Core,
  scope: Scope,
  row: Row,
  parts: { n: number; etag: string }[],
) {
  const media = mediaOf(core);
  const { size } = await media.storage.complete(row.key, row.adapter_upload_id, parts);
  if (size !== row.size) {
    await discard(core, scope, row);
    throw new ValidationError({ size: `Received ${size} bytes, expected ${row.size}` });
  }
  const data: Record<string, unknown> = {
    folder: row.folder,
    filename: row.filename,
    key: row.key,
    mimeType: row.mime_type,
    size,
  };
  if (row.mime_type.startsWith("image/")) {
    const head = await media.storage.get(row.key, { start: 0, end: Math.min(size, HEADER) - 1 });
    const found = head && dimensions(await new Response(head.body).bytes());
    if (!found) {
      await discard(core, scope, row);
      throw new ValidationError({ "": "Not a valid image" });
    }
    Object.assign(data, found);
  }

  let doc: Record<string, any>;
  try {
    doc = await tx(core, scope, async (s) => {
      const created = (await write(core, s, col("media"), "create", data))!;
      const readFile = async () => (await media.storage.get(row.key))!.body;
      await runHooks(
        mediaSlot(core, "afterUpload"),
        "doc",
        created,
        mediaArgs(s, { read: readFile }),
      );
      await s.trx!.deleteFrom("cms_uploads").where("id", "=", row.id).execute();
      return created;
    });
  } catch (error) {
    await discard(core, scope, row);
    throw error;
  }
  // A failed variant is logged and renders on first request instead.
  if (media.images?.provider.prerender && hasVariants(media.images, doc))
    await renderAll(media, doc, media.allowlist.keys());
  return read(core, doc);
}

// Renders the variants `ids` of `doc` and returns how many succeeded. A failure is logged.
async function renderAll(media: MediaCore, doc: Record<string, any>, ids: Iterable<string>) {
  const { images, storage, allowlist } = media;
  let rendered = 0;
  for (const id of ids) {
    try {
      const { data, mimeType } = await images!.provider.render!(
        doc.key,
        allowlist.get(id)!,
        storage,
      );
      await storage.put(variantKey(doc.key, id), data, mimeType);
      rendered++;
    } catch (error) {
      log.error(`Rendering ${id} of ${doc.key} failed`, error);
    }
  }
  return rendered;
}

/**
 * `cms.media.regenerate()`: brings stored variants in line with the current image options. Deletes variants the options no
 * longer produce and, with `prerender`, renders missing ones. `force` re-renders every variant, or deletes them all without
 * `prerender`. Without `id`, runs for every file and deletes the variants of files that no longer exist.
 * Returns `undefined` for a missing document. Throws when the provider has no `render`, because nothing is stored.
 */
export async function regenerate(core: Core, scope: Scope, id?: string, { force = false } = {}) {
  const media = mediaOf(core);
  if (!media.images?.provider.render)
    throw new Error("integral-cms: regenerate needs an image provider with `render`");
  const db = await q(core, scope);
  let docs: Record<string, any>[];
  if (id) {
    const doc = await loadDoc(db, "media", id);
    if (!doc) return undefined;
    docs = [doc];
  } else docs = await findDocs(db, "media", {});
  const total = { rendered: 0, removed: 0 };
  for (const doc of docs) {
    const { rendered, removed } = await regenerateDoc(media, doc, force);
    total.rendered += rendered;
    total.removed += removed;
  }
  if (!id) {
    // ponytail: lists every variant in one go. Page through storage if a library outgrows memory.
    const keys = new Set(docs.map((d) => d.key));
    for (const variant of await media.storage.list(VARIANTS)) {
      const key = variant.slice(VARIANTS.length, variant.lastIndexOf("/"));
      if (keys.has(key)) continue;
      await media.storage.delete(variant);
      total.removed++;
    }
  }
  return total;
}

async function regenerateDoc(media: MediaCore, doc: Record<string, any>, force: boolean) {
  const { images, storage, allowlist } = media;
  const wanted = hasVariants(images!, doc) ? allowlist : new Map<string, Modifiers>();
  const prerendering = Boolean(images!.provider.prerender);
  const existing = await variantsOf(storage, doc.key);
  let removed = 0;
  for (const id of existing)
    if (!wanted.has(id) || (force && !prerendering)) {
      await storage.delete(variantKey(doc.key, id));
      removed++;
    }
  const ids = [...wanted.keys()];
  const missing = force ? ids : ids.filter((id) => !existing.includes(id));
  const rendered = prerendering ? await renderAll(media, doc, missing) : 0;
  return { rendered, removed };
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

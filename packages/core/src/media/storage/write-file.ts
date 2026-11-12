import { chunks } from "../operations/uploads/chunks.ts";
import type { Storage } from "./types.ts";

// One hour, in seconds.
const PART_URL_TTL = 3600;

/**
 * Writes a stream of unknown length to `key`. A stream of one part goes in with `put()`, a longer one in a multipart
 * upload. At most two parts are held in memory. A failed multipart upload is aborted.
 */
export async function writeFile(
  storage: Storage,
  key: string,
  body: ReadableStream<Uint8Array>,
  mimeType: string,
) {
  const parts = chunks(body, storage.partSize);
  const first = await parts.next();
  const second = first.done ? first : await parts.next();
  if (second.done) return storage.put(key, first.value ?? new Uint8Array(), mimeType);

  const { uploadId } = await storage.createUpload(key, { mimeType });
  try {
    const etags: { n: number; etag: string }[] = [];
    const send = async (part: Uint8Array) => {
      const n = etags.length + 1;
      etags.push({ n, ...(await putPartOf(storage, key, uploadId, n, part)) });
    };
    await send(first.value!);
    await send(second.value);
    for await (const part of parts) await send(part);
    await storage.complete(key, uploadId, etags);
  } catch (error) {
    await storage.abort(key, uploadId).catch(() => {});
    throw error;
  }
}

// Part `n` of a multipart upload: streamed into a proxied adapter, or PUT to a presigned URL.
async function putPartOf(
  storage: Storage,
  key: string,
  uploadId: string,
  n: number,
  part: Uint8Array,
) {
  if (storage.putPart)
    return storage.putPart(
      key,
      uploadId,
      n,
      new Blob([part as BlobPart]).stream(),
      storage.partSize,
    );
  return putToUrl(await storage.partUrl!(key, uploadId, n, PART_URL_TTL), part, n);
}

/** PUTs part `n` to a presigned URL and returns the storage's ETag. */
export async function putToUrl(url: string, part: Uint8Array, n: number) {
  const res = await fetch(url, { method: "PUT", body: part as BodyInit });
  if (!res.ok) throw new Error(`Uploading part ${n} failed: ${res.status}`);
  return { etag: res.headers.get("etag") ?? "" };
}

import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { create } from "./create.operation.ts";
import { uploadOf } from "./get-upload.ts";
import { putPart } from "./put-part.operation.ts";
import { complete } from "./complete.operation.ts";
import { abort } from "./abort.operation.ts";

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

import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { abort } from "./abort.operation.ts";
import { chunks } from "./chunks.ts";
import { complete } from "./complete.operation.ts";
import { create } from "./create.operation.ts";
import { putPart } from "./put-part.operation.ts";
import { findUpload } from "./upload-row.ts";
import { putToUrl } from "../../storage/write-file.ts";

/** `cms.media.upload()`: steps 1 to 4 without HTTP. With `partUrl` storage, parts go to the presigned URLs. */
export async function upload(
  core: Core,
  scope: Scope,
  data: Uint8Array | ReadableStream<Uint8Array>,
  info: { filename: string; mimeType: string; folder?: string; size?: number },
) {
  const size = data instanceof Uint8Array ? data.length : info.size;
  const plan = await create(core, scope, { ...info, size });
  const row = (await findUpload(core, scope, plan.id))!;
  const proxied = Boolean(mediaOf(core).storage.putPart);

  try {
    const etags: { n: number; etag: string }[] = [];
    let n = 0;

    for await (const part of chunks(data, plan.partSize)) {
      n++;
      const { etag } = proxied
        ? await putPart(core, row, n, new Blob([part as BlobPart]).stream())
        : await putToUrl(plan.parts[n - 1].url, part, n);
      etags.push({ n, etag });
    }

    return await complete(core, scope, row, etags);
  } catch (error) {
    await abort(core, scope, row).catch(() => {});
    throw error;
  }
}

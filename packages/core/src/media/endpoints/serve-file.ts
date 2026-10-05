import type { Core } from "../../cms/runtime/types.ts";
import { mediaByKey } from "../../db/queries/media/media-by-key.query.ts";
import type { Storage } from "../storage/types.ts";

/** Headers for every served file. User files MAY be HTML or SVG; they MUST NOT run scripts on the host's origin. */
export const SAFE = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

/** The media document stored at `key`. `undefined` for a missing one and for reserved keys such as `.variants/…`. */
export const findByKey = async (core: Core, key: string) =>
  key.startsWith(".") ? undefined : mediaByKey(await core.db(), key);

/** `bytes=a-b`, `bytes=a-` or `bytes=-n` of a file of `size` bytes. `null` for a range that does not fit. */
function parseRange(header: string, size: number) {
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

/** The whole file, or the part `range` asks for. `undefined` for a missing file. */
export async function serveFile(storage: Storage, doc: Record<string, any>, range?: string) {
  // With a range, one byte is enough to learn the size.
  const file = await storage.get(doc.key, range ? { start: 0, end: 0 } : undefined);
  if (!file) return undefined;

  const headers = { ...SAFE, "content-type": doc.mimeType, "accept-ranges": "bytes" };
  if (!range)
    return new Response(file.body, {
      headers: { ...headers, "content-length": String(file.size) },
    });

  await file.body.cancel();
  const bytes = parseRange(range, file.size);
  if (!bytes)
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${file.size}` },
    });

  const part = (await storage.get(doc.key, bytes))!;
  return new Response(part.body, {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(bytes.end - bytes.start + 1),
      "content-range": `bytes ${bytes.start}-${bytes.end}/${file.size}`,
    },
  });
}

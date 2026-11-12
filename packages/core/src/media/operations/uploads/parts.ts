import { API_BASE } from "../../../client/index.ts";
import { ValidationError } from "../../../errors.ts";
import type { Storage } from "../../storage/types.ts";
import { DAY, type Row } from "./upload-row.ts";

/** The part size of one upload: the adapter's, raised until there are at most 10000 parts, the S3 limit. */
export const effectivePartSize = (size: number, partSize: number) =>
  Math.max(partSize, Math.ceil(size / 10_000));

/** The number of parts of an upload. At least one, so an empty file still has a part. */
export const partsOf = (row: Pick<Row, "size" | "part_size">) =>
  Math.max(1, Math.ceil(row.size / row.part_size));

/**
 * The byte length part `n` MUST have. Every part has the part size, except the last, which holds the rest.
 * @throws {ValidationError} For `n` out of range.
 */
export function partLength(row: Row, n: number) {
  const parts = partsOf(row);
  if (!Number.isInteger(n) || n < 1 || n > parts) throw new ValidationError({ n: "Out of range" });
  return n < parts ? row.part_size : row.size - (parts - 1) * row.part_size;
}

/**
 * One upload URL per part: presigned for direct storage, `<route>/parts/<n>` for proxied storage.
 * @param route The upload's path under the API, e.g. `/media/uploads/<id>`.
 */
export function partUrls(
  storage: Storage,
  upload: { key: string; uploadId: string; parts: number },
  route: string,
) {
  const { key, uploadId, parts } = upload;
  const urlOf = async (n: number) =>
    storage.partUrl
      ? await storage.partUrl(key, uploadId, n, DAY / 1000)
      : `${API_BASE}${route}/parts/${n}`;

  return Promise.all(
    Array.from({ length: parts }, async (_, i) => ({ n: i + 1, url: await urlOf(i + 1) })),
  );
}

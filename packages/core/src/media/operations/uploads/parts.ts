import { z } from "zod";
import { API_BASE } from "../../../client/index.ts";
import { ValidationError } from "../../../errors.ts";
import { validateInput } from "../../../schema/validation/validate-input.ts";
import type { Storage } from "../../storage/types.ts";
import type { UploadRow } from "../../../db/types.ts";
import { DAY } from "./upload-row.ts";

/** The part size of one upload: the adapter's, raised until there are at most 10000 parts, the S3 limit. */
export const effectivePartSize = (size: number, partSize: number) =>
  Math.max(partSize, Math.ceil(size / 10_000));

/** The number of parts of an upload. At least one, so an empty file still has a part. */
export const partsOf = (row: Pick<UploadRow, "size" | "part_size">) =>
  Math.max(1, Math.ceil(row.size / row.part_size));

/**
 * The byte length part `n` MUST have. Every part has the part size, except the last, which holds the rest.
 * @throws {ValidationError} For `n` out of range.
 */
export function partLength(row: UploadRow, n: number) {
  const parts = partsOf(row);
  if (!Number.isInteger(n) || n < 1 || n > parts) throw new ValidationError({ n: "Out of range" });
  return n < parts ? row.part_size : row.size - (parts - 1) * row.part_size;
}

const ETAG =
  "MUST be the part's ETag. Direct uploads need a bucket CORS setting that exposes the ETag header.";

/**
 * The finished parts of an upload, from untrusted input: each with `n` in the upload's range and a non-empty `etag`.
 * An empty list is valid, because proxied storage knows its parts.
 * @throws {ValidationError} Keyed by the path of each wrong value, e.g. `parts.0.n`.
 */
export function requireUploadParts(row: Pick<UploadRow, "size" | "part_size">, parts: unknown) {
  const part = z.object({
    n: z.int().min(1).max(partsOf(row)),
    etag: z.string({ error: ETAG }).min(1, ETAG),
  });
  return validateInput(z.object({ parts: z.array(part) }), { parts }).parts;
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

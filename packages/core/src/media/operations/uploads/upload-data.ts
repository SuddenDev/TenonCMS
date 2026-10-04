import type { Selectable } from "kysely";
import type { Database } from "../../../db/types.ts";

// An upload takes four steps, each its own request: `create`, `putPart` per part (proxied storage only), then
// `complete` or `abort`. `upload()` runs them in one call for the local API.

export type Row = Selectable<Database["cms_uploads"]>;

export const DAY = 24 * 60 * 60 * 1000;

/** The part size of one upload: the adapter's, raised until there are at most 10000 parts, the S3 limit. */
export const effectivePartSize = (size: number, partSize: number) =>
  Math.max(partSize, Math.ceil(size / 10_000));

export const partsOf = (row: Pick<Row, "size" | "part_size">) =>
  Math.max(1, Math.ceil(row.size / row.part_size));

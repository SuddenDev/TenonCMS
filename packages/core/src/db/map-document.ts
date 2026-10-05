import { type Row } from "./types.ts";

const iso = (time: number) => new Date(time).toISOString();

/** Parses the data of a row and adds `publishedAt` and `hasDraft`. */
export const withMeta = (row: Pick<Row, "data" | "published_at" | "has_draft">) => ({
  ...JSON.parse(row.data),
  publishedAt: row.published_at == null ? null : iso(row.published_at),
  hasDraft: Boolean(row.has_draft),
});

/** Turns a row into a document with its id and every metadata field. */
export const toDoc = (row: Row): Record<string, any> & { id: string } => ({
  ...withMeta(row),
  id: row.id,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

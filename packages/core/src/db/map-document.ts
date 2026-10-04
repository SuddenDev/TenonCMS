import { type Row } from "./types.ts";

const iso = (time: number) => new Date(time).toISOString();

/** The data of a row with its meta. */
export const withMeta = (row: Pick<Row, "data" | "published_at" | "has_draft">) => ({
  ...JSON.parse(row.data),
  publishedAt: row.published_at == null ? null : iso(row.published_at),
  hasDraft: Boolean(row.has_draft),
});

export function toDoc(row: Row): Record<string, any> & { id: string } {
  return {
    ...withMeta(row),
    id: row.id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

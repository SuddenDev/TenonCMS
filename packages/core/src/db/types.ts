import type { Selectable } from "kysely";

export interface Database {
  cms_documents: {
    id: string;
    collection: string;
    data: string;
    /** The pending version, or `NULL` when nothing is pending. */
    draft: string | null;
    created_at: number;
    updated_at: number;
    /** `NULL` for a document that was never published. */
    published_at: number | null;
  };
  cms_globals: {
    name: string;
    data: string;
    draft: string | null;
    created_at: number;
    updated_at: number;
    published_at: number | null;
  };
  cms_uploads: {
    id: string;
    key: string;
    folder: string;
    filename: string;
    mime_type: string;
    size: number;
    part_size: number;
    adapter_upload_id: string;
    user_id: string | null;
    created_at: number;
  };
}

/** A document as the content queries read it: `data` holds the perspective's data, `has_draft` whether a draft is pending. */
export type Row = Pick<
  Selectable<Database["cms_documents"]>,
  "id" | "data" | "created_at" | "updated_at" | "published_at"
> & { has_draft: number };

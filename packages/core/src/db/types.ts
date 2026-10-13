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
  cms_document_locales: {
    document_id: string;
    locale: string;
    /** The localized fields of this locale. */
    data: string;
    draft: string | null;
    created_at: number;
    updated_at: number;
    /** `NULL` while this locale was never published. */
    published_at: number | null;
  };
  cms_global_locales: {
    name: string;
    locale: string;
    data: string;
    draft: string | null;
    created_at: number;
    updated_at: number;
    published_at: number | null;
  };
  /** The localized top-level keys last synced, per collection or global. */
  cms_schema_state: {
    kind: string;
    name: string;
    /** A JSON array of keys, or `NULL` when the entry is not localized. */
    localized: string | null;
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

/**
 * The locale columns of a localized read. `r_*` belong to the requested locale's row, `d_*` to the default locale's;
 * `r_data` and `d_data` are `NULL` for a missing row.
 */
export type LocaleColumns = {
  r_data: string | null;
  d_data: string | null;
  r_published_at: number | null;
  r_has_draft: number;
  d_published_at: number | null;
  d_has_draft: number;
  /** A JSON array of the locales with a row. Missing for a global. */
  locales?: string;
  /** Whether the shared row has a pending draft that differs from its published data. */
  shared_draft?: number;
};

/**
 * A document as the content queries read it: `data` holds the perspective's data, `has_draft` whether a draft is
 * pending. A localized read adds the locale columns; `data` is then the shared data.
 */
export type Row = Pick<
  Selectable<Database["cms_documents"]>,
  "id" | "data" | "created_at" | "updated_at" | "published_at"
> & { has_draft: number } & Partial<LocaleColumns>;

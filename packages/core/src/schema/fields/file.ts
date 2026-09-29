import type { Base } from "./common.ts";

// Options of `image` and `file`.
export type MediaFieldOptions = Base<unknown, string | string[]> & {
  /** Store an array of media ids instead of one. Not filterable. With `required`, at least one id. */
  many?: boolean;
  /** Allowed MIME types, `type/*` wildcards allowed, e.g. `['application/pdf']`. Checked on write against the file. On `image`, it narrows `image/*`. */
  accept?: string[];
  /** Largest file in bytes. Narrows `media.maxSize`. Checked on write and in the admin before upload. */
  maxSize?: number;
  /** Folder that "Upload new" in the admin uploads into, e.g. `'downloads'`. Default: the root. */
  folder?: string;
  /**
   * What happens to this field when the file is deleted:
   * - `'restrict'`: the delete fails with 409 and lists the referencing documents.
   * - `'set-null'`: this field becomes `null`; with `many`, the id is removed from the array.
   *
   * Default `'restrict'`. `required` with `'set-null'` is not allowed.
   */
  onDelete?: "set-null" | "restrict";
};

/** A file of the media library, stored as its id. Reads resolve it to a `File`, see `populate`. */
export type FileField = MediaFieldOptions & { type: "file" };

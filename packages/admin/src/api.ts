import { ref } from "vue";
import { createClient } from "../../core/src/client";
import { accepts } from "../../core/src/media/names";
import { matchCondition } from "../../core/src/schema/condition";

export { SLUG_PATTERN, slugify } from "../../core/src/helpers/slugify";

export { CmsError } from "../../core/src/client";
import type { Collection, Field, Schema } from "../../core/src/schema";

export type { Data, Field, Fields, MediaRead } from "../../core/src/schema";

export const client = createClient<{ schema: Schema }>();

export const schema = ref<Schema & { media?: { regenerate: boolean } }>({});

/** Field shown as a document's title in lists and page titles. */
export function titleField(collection: Collection) {
  return (
    collection.titleField ??
    Object.keys(collection.fields).find(
      (k) => !["group", "join"].includes(collection.fields[k].type),
    ) ??
    ""
  );
}

/** A group value is empty when every value is null, '', false, [] or an empty group. */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "" || value === false) return true;
  return typeof value === "object" && Object.values(value).every(isEmpty);
}

/** Whether a field applies, by its `condition`. `root` is the whole form data, `sibling` the object that holds the field. */
export function active(field: Field, root: unknown, sibling: unknown) {
  return !field.condition || matchCondition(field.condition, root, sibling);
}

/** Bytes as `1.2 MB`. */
export function formatSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  for (; bytes >= 1024 && i < units.length - 1; i++) bytes /= 1024;
  return `${i && bytes < 10 ? bytes.toFixed(1) : Math.round(bytes)} ${units[i]}`;
}

/** The rules of an `image` or `file` field that the admin checks before a pick or an upload. */
export type MediaRules = { type: string; accept?: string[]; maxSize?: number };

/** Whether a file fits an `image` or `file` field: type and size. The server checks it again on save. */
export function fits(rules: MediaRules, file: { mimeType: string; size: number }) {
  return (
    (rules.type !== "image" || file.mimeType.startsWith("image/")) &&
    accepts(rules.accept, file.mimeType) &&
    (rules.maxSize === undefined || file.size <= rules.maxSize)
  );
}

/** A Lucide icon name for a file type. */
export function fileIcon(mimeType: string) {
  if (mimeType.startsWith("video/")) return "film";
  if (mimeType.startsWith("audio/")) return "music";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return "file-text";
  return "file";
}

import { accepts } from "../../../../core/src/media/library/names";

/** Bytes as `1.2 MB`, the number in `locale`. */
export function formatSize(bytes: number, locale: string) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  for (; bytes >= 1024 && i < units.length - 1; i++) bytes /= 1024;
  const digits = i && bytes < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(bytes)} ${units[i]}`;
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

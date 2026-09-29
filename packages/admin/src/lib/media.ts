import { accepts } from "../../../core/src/media/names";

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

import { accepts } from "../../../../core/src/media/library/names";
import { API_BASE } from "../../../../core/src/client/constants";

/**
 * Builds a native download link for originals or a ZIP of files and folders.
 * @returns The protected media download URL with repeated selection parameters.
 */
export function mediaDownload(ids: string[], folders: string[] = []) {
  const query = new URLSearchParams([
    ...ids.map((id) => ["id", id]),
    ...folders.map((folder) => ["folder", folder]),
  ]);
  return `${API_BASE}/media/download?${query}`;
}

/**
 * Lists immediate child folders, including parents inferred from nested paths.
 * @returns Unique child names and paths, sorted by name.
 */
export function childFolders(paths: string[], folder: string) {
  const prefix = folder ? `${folder}/` : "";
  const names = paths
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length).split("/")[0]!)
    .filter(Boolean);
  return [...new Set(names)].sort().map((name) => ({ name, path: `${prefix}${name}` }));
}

/**
 * Formats bytes with binary units and a localized number.
 * @returns A size label such as `1.2 MB`.
 */
export function formatSize(bytes: number, locale: string) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  for (; bytes >= 1024 && i < units.length - 1; i++) bytes /= 1024;
  const digits = i && bytes < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(bytes)} ${units[i]}`;
}

/** The rules of an `image` or `file` field that the admin checks before a pick or an upload. */
export type MediaRules = { type: string; accept?: string[]; maxSize?: number };

/**
 * Checks a field's type and size restrictions before a pick or upload. The server checks again on save.
 * @returns Whether the file fits every restriction.
 */
export function fits(rules: MediaRules, file: { mimeType: string; size: number }) {
  return (
    (rules.type !== "image" || file.mimeType.startsWith("image/")) &&
    accepts(rules.accept, file.mimeType) &&
    (rules.maxSize === undefined || file.size <= rules.maxSize)
  );
}

/**
 * Classifies a MIME type for the media cards.
 * @returns A key under `media.types` in the translations.
 */
export function fileType(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  const kind = mimeType.split("/")[0]!;
  return ["image", "video", "audio", "text"].includes(kind) ? kind : "file";
}

/**
 * Chooses an icon for a file's MIME type.
 * @returns A Lucide icon name, with `file` as the fallback.
 */
export function fileIcon(mimeType: string) {
  if (mimeType.startsWith("video/")) return "film";
  if (mimeType.startsWith("audio/")) return "music";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return "file-text";
  return "file";
}

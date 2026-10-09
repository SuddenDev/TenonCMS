import type { PreviewMessage } from "../config/types.ts";

/** Validates the shared preview protocol at both window boundaries. */
export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  const identity = typeof m.collection === "string" && typeof m.id === "string";
  switch (m.type) {
    case "ready":
      return true;
    case "mode":
      return typeof m.edit === "boolean";
    case "url":
      return typeof m.href === "string";
    case "documents":
      return (
        Array.isArray(m.documents) &&
        m.documents.every((d) => d && typeof d.collection === "string" && typeof d.id === "string")
      );
    case "highlight":
      return (m.collection === null && m.id === null) || identity;
    case "edit":
      return identity && typeof m.path === "string";
    case "saved":
      return identity;
    case "draft":
      return identity && !!m.data && typeof m.data === "object" && !Array.isArray(m.data);
    default:
      return false;
  }
}

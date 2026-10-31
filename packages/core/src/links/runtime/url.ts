// This file MUST have no imports. The admin bundles it.

/** Accepts web URLs, email, telephone, relative paths and fragments. Executable schemes are rejected. */
export function safeLinkUrl(value: unknown): value is string {
  if (typeof value !== "string" || /[\s\p{Cc}]/u.test(value)) return false;
  return !/^[a-z][a-z\d+.-]*:/i.test(value) || /^(https?:|mailto:|tel:)/i.test(value);
}

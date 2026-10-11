/** Escapes a value for use in HTML text and attributes. */
export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

import { PLACEHOLDER } from "./placeholders.ts";

/**
 * Fills each `{dot.path}` with the value at that path of `doc`. Returns `null` when a value is missing, empty or not a
 * string or number, so a half-filled document has no preview.
 */
export function resolveTemplate(template: string, doc: unknown): string | null {
  let missing = false;
  const url = template.replace(PLACEHOLDER, (_, path: string) => {
    const value = path
      .split(".")
      .reduce<unknown>((v, key) => (v && typeof v === "object" ? (v as any)[key] : undefined), doc);
    if (typeof value === "number" || (typeof value === "string" && value)) return String(value);
    missing = true;
    return "";
  });
  return missing ? null : url;
}

import { Mask } from "maska";

/**
 * Formats the raw value of a `text` field with its `mask`, the same way the admin input shows it.
 * @returns `""` for `null` or `undefined`.
 */
export function formatMask(value: string | null | undefined, mask: string) {
  return value ? new Mask({ mask }).masked(value) : "";
}

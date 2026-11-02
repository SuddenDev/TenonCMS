import { ValidationError } from "../errors.ts";
import type { SyncChoice } from "../content/writes/sync-structure.ts";

/**
 * Reads the `sync` of a structure switch body.
 * @throws {ValidationError} For anything but `true`, `false` or `"default"`.
 */
export function syncChoice(value: unknown): SyncChoice {
  if (value === true || value === false || value === "default") return value;
  throw new ValidationError({ sync: 'Expected true, false or "default"' });
}

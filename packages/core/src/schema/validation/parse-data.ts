import { ValidationError } from "../../errors.ts";
import { type Fields } from "../index.ts";
import { dataSchema } from "./build-data-schema.ts";

/**
 * Validates `data` against `fields`. The validator is built per write, because conditions depend on the data.
 * @param loose Check types only, as if every condition were false. Draft saves use it.
 * @returns The parsed data without unknown keys.
 * @throws {ValidationError} With a message per field path.
 */
export function parseData(fields: Fields, data: unknown, loose = false) {
  const result = dataSchema(fields, data, data, !loose).safeParse(data);
  if (!result.success)
    throw new ValidationError(
      Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message])),
    );
  return result.data as Record<string, unknown>;
}

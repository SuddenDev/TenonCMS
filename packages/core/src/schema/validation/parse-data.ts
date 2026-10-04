import { ValidationError } from "../../errors.ts";
import { type Fields } from "../index.ts";
import { dataSchema } from "./build-data-schema.ts";

/**
 * Validates `data` against `fields`. Throws a `ValidationError` keyed by field path. Built per write, because conditions depend on the data.
 * `loose`: types only, as if every condition were false. Draft saves use it.
 */
export function parseData(fields: Fields, data: unknown, loose = false) {
  const result = dataSchema(fields, data, data, !loose).safeParse(data);
  if (!result.success)
    throw new ValidationError(
      Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message])),
    );
  return result.data as Record<string, unknown>;
}

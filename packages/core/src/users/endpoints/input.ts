import type { z } from "zod";
import { ValidationError } from "../../errors.ts";

/**
 * Validates a request body.
 * @throws {ValidationError} With a message per field path, so HTTP answers 400.
 */
export function input<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success)
    throw new ValidationError(
      Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message])),
    );
  return result.data;
}

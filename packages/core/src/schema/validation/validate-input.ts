import type { z } from "zod";
import { ValidationError } from "../../errors.ts";

/**
 * Validates untrusted input, such as a request body, a query or a local call's arguments. `undefined` and `null` count as `{}`.
 * @throws {ValidationError} With a message per field path, so HTTP answers 400.
 */
export function validateInput<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw validationErrorOf(result.error);
  return result.data;
}

/** Keys a zod error's issues by field path. A later issue on the same path wins. */
export function validationErrorOf(error: z.ZodError): ValidationError {
  return new ValidationError(
    Object.fromEntries(error.issues.map((i) => [i.path.join("."), i.message])),
  );
}

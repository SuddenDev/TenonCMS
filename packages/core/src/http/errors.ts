import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ConflictError, ValidationError } from "../errors.ts";
import type { Env } from "./middleware/types.ts";

/**
 * Creates the error a handler throws for a missing document, global or route.
 * @returns An `HTTPException` with status 404.
 */
export const notFound = () => new HTTPException(404, { message: "Not Found" });

/**
 * Maps a thrown error to a JSON response. Unexpected errors MAY hold internals, so only expected errors send their
 * own message; the rest are logged and answer 500.
 * @returns 400 with `errors` for a `ValidationError`, 409 with `references` for a `ConflictError`, the status of an
 * `HTTPException`, else 500.
 */
export const handleError: ErrorHandler<Env> = (err, c) => {
  if (err instanceof ValidationError)
    return c.json({ message: err.message, errors: err.errors }, 400);
  if (err instanceof ConflictError)
    return c.json({ message: err.message, references: err.references }, 409);
  if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);

  console.error(err);
  return c.json({ message: "Internal Server Error" }, 500);
};

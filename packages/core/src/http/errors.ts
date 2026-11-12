import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { LinkedContentError, ConflictError, ForbiddenError, ValidationError } from "../errors.ts";
import type { Env } from "./middleware/types.ts";
import type { Core } from "../cms/runtime/types.ts";
import { reportError } from "../lifecycle/run-lifecycle.ts";

/**
 * Creates the error a handler throws for a missing document, global or route.
 * @returns An `HTTPException` with status 404.
 */
export const notFound = () => new HTTPException(404, { message: "Not Found" });

/**
 * Maps a thrown error to a JSON response. Unexpected errors MAY hold internals, so only expected errors send their
 * own message; the rest are logged, handed to `afterError` and answer 500.
 * @returns 400 with `errors` for a `ValidationError`, 409 with `references` for a `ConflictError`, the status of a
 * `ForbiddenError` or an `HTTPException`, else 500.
 */
export const errorHandler =
  (core: Core): ErrorHandler<Env> =>
  async (err, c) => {
    if (err instanceof ValidationError)
      return c.json({ message: err.message, errors: err.errors }, 400);
    if (err instanceof LinkedContentError)
      return c.json({ message: err.message, code: err.code, references: err.references }, 409);
    if (err instanceof ConflictError)
      return c.json({ message: err.message, code: err.code, references: err.references }, 409);
    if (err instanceof ForbiddenError) return c.json({ message: err.message }, err.status);
    if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);

    console.error(err);
    await reportError(core, { error: err, source: "request", request: c.req.raw });
    return c.json({ message: "Internal Server Error" }, 500);
  };

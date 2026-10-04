import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ConflictError, ValidationError } from "../errors.ts";
import type { Env } from "./middleware/types.ts";

export const notFound = () => new HTTPException(404, { message: "Not Found" });

// Unexpected errors MAY hold internals, so only expected errors send their own message.
export const handleError: ErrorHandler<Env> = (err, c) => {
  if (err instanceof ValidationError)
    return c.json({ message: err.message, errors: err.errors }, 400);
  if (err instanceof ConflictError)
    return c.json({ message: err.message, references: err.references }, 409);
  if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);
  console.error(err);
  return c.json({ message: "Internal Server Error" }, 500);
};

import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { removeMedia } from "../operations/delete.operation.ts";
import { scope } from "./request-context.ts";

/** Protected `DELETE /:id`: deletes a file, its variants and its document. */
export function deleteEndpoints(core: Core) {
  const api = new Hono<Env>();
  api.delete("/:id", async (c) => {
    await removeMedia(core, scope(c), c.req.param("id"));
    return c.body(null, 204);
  });
  return api;
}

import { Hono, type MiddlewareHandler } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import { createApiKey } from "../operations/create-api-key.operation.ts";
import { deleteApiKey } from "../operations/delete-api-key.operation.ts";
import { listApiKeys } from "../operations/list-api-keys.operation.ts";
import { revokeApiKey } from "../operations/revoke-api-key.operation.ts";
import { rollApiKey } from "../operations/roll-api-key.operation.ts";

const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.var.user.role !== "admin")
    return c.json({ message: "Only admins can manage API keys" }, 403);
  await next();
};

/**
 * Protected key routes, for admins only: `GET`/`POST /api-keys`, `POST /api-keys/:id/roll`,
 * `POST /api-keys/:id/revoke` and `DELETE /api-keys/:id`. `apiKeyReach()` keeps API key callers out.
 * `createApiKey()` validates the body.
 */
export function apiKeysEndpoint(core: Core) {
  return new Hono<Env>()
    .use("/api-keys", requireAdmin)
    .use("/api-keys/*", requireAdmin)
    .get("/api-keys", async (c) => c.json(await listApiKeys(core)))
    .post("/api-keys", async (c) =>
      c.json(await createApiKey(core, c.var.user, await parseBody(c.req)), 201),
    )
    .post("/api-keys/:id/roll", async (c) => c.json(await rollApiKey(core, c.req.param("id"))))
    .post("/api-keys/:id/revoke", async (c) => {
      await revokeApiKey(core, c.req.param("id"));
      return c.body(null, 204);
    })
    .delete("/api-keys/:id", async (c) => {
      await deleteApiKey(core, c.req.param("id"));
      return c.body(null, 204);
    });
}

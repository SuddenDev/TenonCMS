import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import { input } from "../../users/endpoints/input.ts";
import { createApiKey } from "../operations/create-api-key.operation.ts";
import { deleteApiKey } from "../operations/delete-api-key.operation.ts";
import { listApiKeys } from "../operations/list-api-keys.operation.ts";
import { revokeApiKey } from "../operations/revoke-api-key.operation.ts";
import { rollApiKey } from "../operations/roll-api-key.operation.ts";
import { apiKeyTargets } from "../types.ts";

const DAY = 86_400;

const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.var.user.role !== "admin")
    return c.json({ message: "Only admins can manage API keys" }, 403);
  await next();
};

/**
 * Protected key routes, for admins only: `GET`/`POST /api-keys`, `POST /api-keys/:id/roll`,
 * `POST /api-keys/:id/revoke` and `DELETE /api-keys/:id`. `apiKeyReach()` keeps API key callers out.
 */
export function apiKeysEndpoint(core: Core) {
  // Only the schema's targets and their operations, so a key never holds a name the schema lacks.
  const grid = Object.entries(apiKeyTargets(core.schema)).map(
    ([name, ops]) => [name, z.array(z.enum(ops)).optional()] as const,
  );
  // better-auth limits names to 32 characters and expiry to between 1 and 365 days.
  const createBody = z.object({
    name: z.string().trim().min(1).max(32),
    permissions: z.strictObject(Object.fromEntries(grid)),
    expiresIn: z
      .number()
      .int()
      .min(DAY)
      .max(365 * DAY)
      .optional(),
  });

  return new Hono<Env>()
    .use("/api-keys", requireAdmin)
    .use("/api-keys/*", requireAdmin)
    .get("/api-keys", async (c) => c.json(await listApiKeys(core)))
    .post("/api-keys", async (c) => {
      const body = input(createBody, await parseBody(c.req));
      return c.json(await createApiKey(core, c.var.user, body), 201);
    })
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

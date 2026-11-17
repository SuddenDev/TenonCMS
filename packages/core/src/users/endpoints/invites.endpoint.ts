import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import { createInvite } from "../operations/create-invite.operation.ts";
import { listInvites } from "../operations/list-invites.operation.ts";
import { resendInvite } from "../operations/resend-invite.operation.ts";
import { revokeInvite } from "../operations/revoke-invite.operation.ts";
import { input } from "./input.ts";

const createBody = z.object({ email: z.email(), role: z.string(), url: z.string().optional() });
const resendBody = z.object({ url: z.string() });

const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.var.user.role !== "admin")
    return c.json({ message: "Only admins can manage invites" }, 403);
  await next();
};

/**
 * Protected invite routes, for admins only: `GET /invites`, `POST /invites`, `POST /invites/:id/resend` and
 * `DELETE /invites/:id`. Create and resend answer 502 with the result when sending failed. The invite page MUST be in
 * the admin: on the origin of a fixed better-auth `baseURL` (`auth.baseURL`, else `site.url`), else on the request's.
 * Create without `url` links to `/invite` under `admin.path` on that origin.
 */
export function invitesEndpoint(core: Core) {
  const origin = async (url: string) => {
    const { baseURL } = (await core.auth()).options;
    return new URL(typeof baseURL === "string" ? baseURL : url).origin;
  };
  return new Hono<Env>()
    .use("/invites", requireAdmin)
    .use("/invites/*", requireAdmin)
    .get("/invites", async (c) => c.json(await listInvites(core)))
    .post("/invites", async (c) => {
      const body = input(createBody, await parseBody(c.req));
      const result = await createInvite(core, c.var.user, body, await origin(c.req.url));
      return c.json(result, result.message ? 502 : 201);
    })
    .post("/invites/:id/resend", async (c) => {
      const { url } = input(resendBody, await parseBody(c.req));
      const result = await resendInvite(
        core,
        c.var.user,
        c.req.param("id"),
        url,
        await origin(c.req.url),
      );
      return c.json(result, result.message ? 502 : 200);
    })
    .delete("/invites/:id", async (c) => {
      await revokeInvite(core, c.req.param("id"));
      return c.body(null, 204);
    });
}

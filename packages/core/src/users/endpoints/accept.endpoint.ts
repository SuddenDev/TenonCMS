import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import { acceptInvite } from "../operations/accept-invite.operation.ts";
import { checkInvite } from "../operations/check-invite.operation.ts";
import { input } from "./input.ts";

const checkBody = z.object({ token: z.string() });
const acceptBody = z.object({ token: z.string(), name: z.string().min(1), password: z.string() });

// These routes run before the CSRF check. Requiring JSON makes a cross-site request preflight, which fails, so
// another site cannot sign a visitor in to an account of its choosing.
const json: MiddlewareHandler<Env> = async (c, next) => {
  if (!c.req.header("content-type")?.startsWith("application/json"))
    return c.json({ message: "Unsupported Media Type" }, 415);
  await next();
};

/**
 * Public invite routes. `POST /invites/check` with `{ token }` answers `{ email, role }`. `POST /invites/accept` with
 * `{ token, name, password }` creates the user, signs them in and answers `{ user }`. Tokens travel in the body,
 * so they stay out of access logs.
 */
export const acceptEndpoint = (core: Core) =>
  new Hono<Env>()
    .post("/invites/check", json, async (c) => {
      const { token } = input(checkBody, await parseBody(c.req));
      return c.json(await checkInvite(core, token));
    })
    .post("/invites/accept", json, async (c) => {
      const { user, headers } = await acceptInvite(core, input(acceptBody, await parseBody(c.req)));
      for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
      return c.json({ user });
    });

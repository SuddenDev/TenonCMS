import { Hono } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import { jsonOnly } from "../../http/middleware/json-only.middleware.ts";
import type { Env } from "../../http/middleware/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import { acceptInvite } from "../operations/accept-invite.operation.ts";
import { checkInvite } from "../operations/check-invite.operation.ts";
import { validateInput } from "../../schema/validation/validate-input.ts";

const checkBody = z.object({ token: z.string() });
const acceptBody = z.object({
  token: z.string(),
  name: z.string().min(1),
  password: z.string().optional(),
});

/**
 * Public invite routes, JSON only. `POST /invites/check` with `{ token }` answers `{ email, role }`.
 * `POST /invites/accept` with `{ token, name, password }` creates the user, signs them in and answers `{ user }`;
 * `password` only while password sign-in is on. Tokens travel in the body, so they stay out of access logs.
 */
export const acceptEndpoint = (core: Core) =>
  new Hono<Env>()
    .post("/invites/check", jsonOnly, async (c) => {
      const { token } = validateInput(checkBody, await parseBody(c.req));
      return c.json(await checkInvite(core, token));
    })
    .post("/invites/accept", jsonOnly, async (c) => {
      const { user, headers } = await acceptInvite(
        core,
        validateInput(acceptBody, await parseBody(c.req)),
      );
      for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
      return c.json({ user });
    });

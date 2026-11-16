import { Hono } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import { jsonOnly } from "../../http/middleware/json-only.middleware.ts";
import type { Env } from "../../http/middleware/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import { setUpFirstAdmin } from "../operations/set-up.operation.ts";
import { input } from "./input.ts";

const setupBody = z.object({ name: z.string().min(1), email: z.email() });

/**
 * Public, JSON only. `POST /setup` with `{ name, email }` creates the first admin without a password, signs them in
 * and answers `{ user }`. 404 while password sign-in is on, 409 once a user exists.
 */
export const setupEndpoint = (core: Core) =>
  new Hono<Env>().post("/setup", jsonOnly, async (c) => {
    const { user, headers } = await setUpFirstAdmin(core, input(setupBody, await parseBody(c.req)));
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
    return c.json({ user });
  });

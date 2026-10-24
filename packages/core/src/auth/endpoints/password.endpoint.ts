import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { parseBody } from "../../http/parse-body.ts";

// `Core` hides better-auth's API from the type checker, so the one method is typed here.
type Api = {
  setPassword(context: { body: unknown; headers: Headers; asResponse: true }): Promise<Response>;
};

/**
 * `POST /account/password` with `{ newPassword }`: sets the first password of the signed-in user, e.g. one who
 * signed up through another provider. better-auth offers it only on the server; it refuses to replace a password.
 */
export const passwordEndpoint = (core: Core) =>
  new Hono<Env>().post("/account/password", async (c) =>
    ((await core.auth()) as unknown as { api: Api }).api.setPassword({
      body: await parseBody(c.req),
      headers: c.req.raw.headers,
      asResponse: true,
    }),
  );

import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Plugin } from "../../plugins/types.ts";
import { runItemHooks, type AdminBarOptions } from "../config/admin-bar.ts";
import { builtIns } from "../runtime/admin-bar-items.ts";

/**
 * `GET /admin-bar?url=` answers `{ position, items }` for the page at `url`: the built-in stubs after the plugins'
 * and the host's items hooks. Mount it behind the session middleware.
 */
export function adminBarEndpoint(options: AdminBarOptions, plugins: readonly Plugin[]) {
  return new Hono<Env>().get("/admin-bar", async (c) => {
    const ctx = { user: c.var.user, cms: c.var.cms, url: c.req.query("url") ?? "" };
    const items = await runItemHooks(plugins, options, builtIns("site"), ctx);
    return c.json({ position: options.position ?? "top", items });
  });
}

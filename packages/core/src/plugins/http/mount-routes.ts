import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Plugin, RouteEnv, PublicRouteEnv } from "../types.ts";

// Mounts each plugin's routes of one kind under its name.
export function mountRoutes(
  into: Hono<Env>,
  plugins: readonly Plugin[],
  kind: "routes" | "publicRoutes",
) {
  for (const plugin of plugins) {
    // Both kinds get a sub-app that satisfies their environment.
    const add = plugin[kind] as ((api: Hono<RouteEnv & PublicRouteEnv>) => void) | undefined;
    if (!add) continue;
    const sub = new Hono<RouteEnv & PublicRouteEnv>();
    add(sub);
    into.route(`/${plugin.name}`, sub);
  }
}

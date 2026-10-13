import { Hono } from "hono";
import type { Localization } from "../../cms/config/options.ts";
import type { Env } from "../../http/middleware/types.ts";

/**
 * Serves the normalized `localization` option on `GET /localization`, or `null` without it. It holds no secret, so it
 * needs no session. Clients and framework helpers build URLs and language switches from it.
 * @returns A Hono sub-app with the one route.
 */
export function localizationEndpoint(localization?: Localization) {
  return new Hono<Env>().get("/localization", (c) => c.json(localization ?? null));
}

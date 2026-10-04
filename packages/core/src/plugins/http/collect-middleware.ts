import type { MiddlewareHandler } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Plugin } from "../types.ts";

/** The plugins' middleware of one kind, in plugin order. */
export const pluginMiddleware = (
  plugins: readonly Plugin[],
  kind: "middleware" | "publicMiddleware",
) => plugins.flatMap((p) => p[kind] ?? []) as unknown as MiddlewareHandler<Env>[];

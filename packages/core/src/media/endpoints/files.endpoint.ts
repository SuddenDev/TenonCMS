import { serveFile } from "./serve-file.ts";
import { docOf } from "./get-file.ts";
import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { notFound } from "../../http/errors.ts";
import { mediaOf } from "../runtime/create-media-core.ts";

export function filesEndpoints(core: Core) {
  const { storage } = mediaOf(core);
  const api = new Hono<Env>();
  // No `immutable` caching: keys change when a file moves.
  api.get("/files/:key{.+}", async (c) => {
    const doc = await docOf(core, c.req.param("key"));
    const response = doc && (await serveFile(storage, doc, c.req.header("range")));
    if (!response) throw notFound();
    return response;
  });

  return api;
}

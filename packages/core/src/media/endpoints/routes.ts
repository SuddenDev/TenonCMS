import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { foldersReadEndpoints, foldersWriteEndpoints } from "./folders.endpoint.ts";
import { filesEndpoints } from "./files.endpoint.ts";
import { imagesEndpoints } from "./images.endpoint.ts";
import { uploadsEndpoints } from "./uploads.endpoint.ts";
import { updateEndpoints } from "./update.endpoint.ts";
import { regenerateEndpoints } from "./regenerate.endpoint.ts";
import { deleteEndpoints } from "./delete.endpoint.ts";

/** Public media reads and session-protected media writes, in registration order. */
export function mediaRoutes(core: Core) {
  const reads = new Hono<Env>();
  reads.route("/", foldersReadEndpoints(core));
  reads.route("/", filesEndpoints(core));
  reads.route("/", imagesEndpoints(core));
  const writes = new Hono<Env>();
  writes.route("/", uploadsEndpoints(core));
  writes.route("/", foldersWriteEndpoints(core));
  writes.route("/", updateEndpoints(core));
  writes.route("/", regenerateEndpoints(core));
  writes.route("/", deleteEndpoints(core));
  return { reads, writes, regenerate: Boolean(mediaOf(core).images?.provider.render) };
}

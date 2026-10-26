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
import { downloadEndpoint } from "./download.endpoint.ts";

/**
 * The media routes in three groups. `files` (`/files`, `/img`) mount before the caller lookup and check
 * `media.access.read` per file. `reads` and `writes` mount behind it, like the other content routes.
 * @returns The groups, and `regenerate`, which tells `/schema` whether variants can be regenerated.
 */
export function mediaRoutes(core: Core) {
  const files = new Hono<Env>();
  files.route("/", filesEndpoints(core));
  files.route("/", imagesEndpoints(core));

  const reads = foldersReadEndpoints(core);

  const writes = new Hono<Env>();
  writes.route("/", downloadEndpoint(core));
  writes.route("/", uploadsEndpoints(core));
  writes.route("/", foldersWriteEndpoints(core));
  writes.route("/", updateEndpoints(core));
  writes.route("/", regenerateEndpoints(core));
  writes.route("/", deleteEndpoints(core));

  return { files, reads, writes, regenerate: Boolean(mediaOf(core).images?.provider.render) };
}

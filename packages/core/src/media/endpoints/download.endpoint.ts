import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { ValidationError } from "../../errors.ts";
import { notFound } from "../../http/errors.ts";
import { cleanFolder } from "../library/names.ts";
import { downloadArchive } from "../operations/download-archive.operation.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { loadMedia } from "../runtime/read-media.ts";
import { SAFE, serveFile } from "./serve-file.ts";
import { scope } from "./request-context.ts";

/**
 * Registers protected downloads of originals with range support or a streamed ZIP.
 * @returns The `GET /download` route.
 */
export function downloadEndpoint(core: Core) {
  return new Hono<Env>().get("/download", async (c) => {
    const ids = [...new Set(c.req.queries("id") ?? [])];
    const folders = [...new Set(c.req.queries("folder") ?? [])].map((path) => cleanFolder(path));
    if ((!ids.length && !folders.length) || ids.some((id) => !id) || folders.some((path) => !path))
      throw new ValidationError({ selection: "Select files or folders" });

    const headers = { ...SAFE, "cache-control": "private, no-store" };
    if (ids.length === 1 && !folders.length) {
      const doc = await loadMedia(core, scope(c), ids[0]!);
      const response = doc && (await serveFile(mediaOf(core).storage, doc, c.req.header("range")));
      if (!response) throw notFound();
      response.headers.set("content-disposition", attachment(doc.filename));
      response.headers.set("cache-control", headers["cache-control"]);
      return response;
    }

    const archive = await downloadArchive(core, scope(c), ids, folders);
    return new Response(archive.body, {
      headers: {
        ...headers,
        "content-type": "application/zip",
        "content-disposition": attachment(archive.filename),
      },
    });
  });
}

function attachment(filename: string) {
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

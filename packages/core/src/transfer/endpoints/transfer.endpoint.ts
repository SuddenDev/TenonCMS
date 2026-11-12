import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import { notFound } from "../../http/errors.ts";
import type { Env } from "../../http/middleware/types.ts";
import { attachment } from "../../http/attachment.ts";
import { noStore } from "../../http/middleware/no-store.middleware.ts";
import { abort } from "../../media/operations/uploads/abort.operation.ts";
import { putPart } from "../../media/operations/uploads/put-part.operation.ts";
import { body, scope } from "../../media/endpoints/request-context.ts";
import { input } from "../../users/endpoints/input.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { requireBackup } from "../access.ts";
import { ARCHIVE_SCOPES, IMPORT_MODES, type Manifest, ZIP, archiveName } from "../format.ts";
import { checkArchive } from "../operations/check-archive.ts";
import {
  completeImportUpload,
  createImportUpload,
  findImportUpload,
} from "../operations/import-upload.operation.ts";
import { stageExport } from "../operations/stage-export.operation.ts";

// Admins and API keys with the `backup` permission: `read` to export, `update` to import.
const allow =
  (op: "read" | "update"): MiddlewareHandler<Env> =>
  async (c, next) => {
    requireBackup(scope(c), op);
    await next();
  };

const exportQuery = z.object({
  media: z.enum(["true", "false"]).optional(),
  scope: z.enum(ARCHIVE_SCOPES).optional(),
});
const importQuery = z.object({ mode: z.enum(IMPORT_MODES).optional() });
const checkBody = z.object({
  mode: z.enum(IMPORT_MODES).optional(),
  manifest: z.looseObject({
    format: z.string(),
    version: z.number(),
    defaultLocale: z.string(),
    localized: z.record(z.string(), z.array(z.string()).nullable()),
    media: z.boolean(),
    scope: z.enum(ARCHIVE_SCOPES).optional(),
    dialect: z.string().optional(),
    migrations: z.array(z.string()).optional(),
    tables: z.record(z.string(), z.array(z.string())).optional(),
    targets: z.array(z.string()).optional(),
  }),
});

/**
 * Admin routes over `cms.export()` and `cms.import()`.
 * - `GET /export?media=false&scope=full` streams the archive. `POST /export` answers `{ url }`, a link that downloads
 *   it. `GET /export/summary` answers what the archive would hold.
 * - `POST /import?mode=` restores the ZIP in the body. With media, `/import/uploads` takes a bigger archive in parts,
 *   like a media upload: `POST /import/uploads`, `PUT /import/uploads/:id/parts/:n`, then
 *   `POST /import/uploads/:id/complete?mode=` (imports it) or `DELETE /import/uploads/:id`.
 * - `POST /import/check` checks an archive's manifest without the archive, for a dry run.
 * A ZIP or JSON body is not a form type, so browsers send it cross-site only after a CORS preflight, and the routes
 * need no form CSRF check.
 */
export function transferEndpoint(core: Core) {
  const api = new Hono<Env>()
    .use("/export", allow("read"), noStore)
    .use("/export/*", allow("read"), noStore)
    .use("/import", allow("update"), noStore)
    .use("/import/*", allow("update"), noStore)
    .get("/export", async (c) => {
      const { media, scope } = input(exportQuery, c.req.query());
      const body = await c.var.cms.export({ media: media !== "false", scope });
      return new Response(body, {
        headers: { "content-type": ZIP, "content-disposition": attachment(archiveName()) },
      });
    })
    .get("/export/summary", async (c) => {
      const { media, scope } = input(exportQuery, c.req.query());
      return c.json(await c.var.cms.exportSummary({ media: media !== "false", scope }));
    })
    .post("/export", async (c) => {
      const { media, scope: archive } = input(exportQuery, c.req.query());
      return c.json({
        url: await stageExport(core, scope(c), { media: media !== "false", scope: archive }),
      });
    })
    .post("/import", async (c) => {
      if (c.req.header("content-type")?.split(";")[0]?.trim() !== ZIP)
        return c.json({ message: "The body MUST be a ZIP archive (application/zip)" }, 415);
      const { mode } = input(importQuery, c.req.query());
      // The body is held in memory and limited by the host. Big archives go through `/import/uploads`.
      return c.json(await c.var.cms.import(await c.req.blob(), { mode }));
    })
    .post("/import/check", async (c) => {
      const { manifest, mode = "merge" } = input(checkBody, await body(c.req));
      const db = await databaseForScope(core, scope(c));
      return c.json(
        await checkArchive(core, db, manifest as Manifest, { mode, targets: manifest.targets }),
      );
    });
  if (!core.media) return api;

  // Unknown, expired and foreign uploads all answer 404.
  const ownUpload = async (c: Context<Env>) => {
    const row = await findImportUpload(core, scope(c), c.req.param("id")!);
    if (!row) throw notFound();
    return row;
  };
  return api
    .post("/import/uploads", async (c) =>
      c.json(await createImportUpload(core, scope(c), await body(c.req)), 201),
    )
    .put("/import/uploads/:id/parts/:n", async (c) => {
      const row = await ownUpload(c);
      const data = c.req.raw.body ?? new Blob([]).stream();
      return c.json(await putPart(core, row, Number(c.req.param("n")), data));
    })
    .post("/import/uploads/:id/complete", async (c) => {
      const row = await ownUpload(c);
      const { mode } = input(importQuery, c.req.query());
      const { parts } = await body(c.req);
      const list = Array.isArray(parts) ? parts : [];
      return c.json(await completeImportUpload(core, scope(c), row, list, { mode }));
    })
    .delete("/import/uploads/:id", async (c) => {
      await abort(core, scope(c), await ownUpload(c));
      return c.body(null, 204);
    });
}

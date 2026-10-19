import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import { withLocale } from "../../content/locale.ts";
import { locOf } from "../../content/reads/loc-of.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { beforeRead, afterRead } from "../../content/lifecycle/run-read-hooks.ts";
import { col } from "../../content/targets.ts";
import type { RichtextTargets } from "../config/types.ts";
import { ValidationError } from "../../errors.ts";

/** Protected, bounded title search across collections with public permalinks. */
export function richtextTargetsEndpoint(core: Core) {
  return new Hono<Env>().get("/admin/richtext/targets", async (c) => {
    const query = c.req.query("query") ?? "";
    const perspective = c.req.query("perspective") ?? "published";
    if (query.length > 200 || !["published", "drafts"].includes(perspective))
      throw new ValidationError({ query: "Invalid rich text search" });

    const scope = withLocale(core, outerScope(c.var.user, perspective as "published" | "drafts"), {
      locale: c.req.query("locale"),
    });
    const s = { ...scope, cms: core.localApi(scope) };
    const db = await core.db();
    const results: RichtextTargets = [];

    for (const [name, entry] of Object.entries(core.schema.collections)) {
      if (!entry.permalink) continue;

      const key =
        entry.titleField ??
        Object.keys(entry.fields).find((k) =>
          ["text", "textarea", "slug"].includes(entry.fields[k].type),
        );
      if (!key) continue;

      const docs = await findDocs(db, name, {
        limit: 20,
        drafts: perspective === "drafts",
        loc: locOf(core, scope, entry),
        search: { key, query },
      });

      const before = await beforeRead(core, s, col(name), docs, "read");
      const after = await afterRead(core, s, col(name), before, "read");

      results.push({
        collection: name,
        label: entry.label ?? name,
        items: after.map((d) => ({ id: d.id, label: String(d[key] || d.id) })),
      });
    }

    return c.json(results);
  });
}

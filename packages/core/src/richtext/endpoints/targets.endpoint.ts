import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { inner, outerScope } from "../../cms/runtime/operation-context.ts";
import { withLocale } from "../../content/locale.ts";
import { locOf } from "../../content/reads/loc-of.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { beforeRead, afterRead } from "../../content/lifecycle/run-read-hooks.ts";
import { collectionTarget } from "../../content/targets.ts";
import type { RichtextTargets } from "../config/types.ts";
import { ValidationError } from "../../errors.ts";
import { readDecision, canQueryField } from "../../access/read.ts";

/**
 * `GET /admin/richtext/targets`: a bounded title search across collections with public permalinks, within each
 * collection's read rule, in the perspective of the preview cookie.
 * @returns The route. A query longer than 200 characters answers 400.
 */
export function richtextTargetsEndpoint(core: Core) {
  return new Hono<Env>().get("/admin/richtext/targets", async (c) => {
    const query = c.req.query("query") ?? "";
    const { perspective } = c.var;
    if (query.length > 200) throw new ValidationError({ query: "Invalid rich text search" });

    const scope = withLocale(core, outerScope(c.var.user, perspective), {
      locale: c.req.query("locale"),
    });
    const s = inner(core, scope, undefined, {});
    const db = await core.db();
    const results: RichtextTargets = [];

    for (const [name, entry] of Object.entries(core.schema.collections)) {
      if (!entry.permalink) continue;

      const key =
        entry.titleField ??
        Object.keys(entry.fields).find((k) =>
          ["text", "textarea", "slug"].includes(entry.fields[k].type),
        );
      if (!key || !(await canQueryField(core, s, collectionTarget(name), key))) continue;
      const access = await readDecision(core, s, collectionTarget(name));
      if (access === false) continue;

      const docs = await findDocs(db, name, {
        access: typeof access === "object" ? access : undefined,
        limit: 20,
        drafts: perspective === "drafts",
        loc: locOf(core, scope, entry),
        search: { key, query },
      });

      const before = await beforeRead(core, s, collectionTarget(name), docs, "read");
      const after = await afterRead(core, s, collectionTarget(name), before, "read");

      results.push({
        collection: name,
        label: entry.label ?? name,
        items: after.map((d) => ({ id: d.id, label: String(d[key] || d.id) })),
      });
    }

    return c.json(results);
  });
}

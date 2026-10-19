import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import { withLocale } from "../../content/locale.ts";
import { ValidationError } from "../../errors.ts";
import { checkRichtextShape } from "../runtime/validation.ts";
import { resolveRichtext } from "../reads/resolve-richtext.ts";

/** Decorates unsaved editor JSON without persisting URLs or exposing target document data. */
export function richtextResolveEndpoint(core: Core) {
  return new Hono<Env>().post("/admin/richtext/resolve", async (c) => {
    const body = await c.req.json().catch(() => null);

    try {
      checkRichtextShape(body?.document);
    } catch {
      throw new ValidationError({ document: "Invalid rich text document" });
    }

    if (body.perspective !== undefined && !["published", "drafts"].includes(body.perspective))
      throw new ValidationError({ perspective: "Invalid perspective" });
    if (body.locale !== undefined && typeof body.locale !== "string")
      throw new ValidationError({ locale: "Invalid locale" });

    const scope = withLocale(core, outerScope(c.var.user, body.perspective ?? "published"), {
      locale: body.locale,
    });

    await resolveRichtext(core, { ...scope, cms: core.localApi(scope) }, [body.document]);

    return c.json(body.document);
  });
}

import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { inner, outerScope } from "../../cms/runtime/operation-context.ts";
import { withLocale } from "../../content/locale.ts";
import { ValidationError } from "../../errors.ts";
import { checkRichtextShape } from "../runtime/validation.ts";
import { resolveRichtext } from "../reads/resolve-richtext.ts";

/**
 * `POST /admin/richtext/resolve`: decorates unsaved editor JSON in the perspective of the preview cookie, without
 * persisting URLs or exposing target document data.
 * @returns The route. A malformed document or locale answers 400.
 */
export function richtextResolveEndpoint(core: Core) {
  return new Hono<Env>().post("/admin/richtext/resolve", async (c) => {
    const body = await c.req.json().catch(() => null);

    try {
      checkRichtextShape(body?.document);
    } catch {
      throw new ValidationError({ document: "Invalid rich text document" });
    }

    if (body.locale !== undefined && typeof body.locale !== "string")
      throw new ValidationError({ locale: "Invalid locale" });

    const scope = withLocale(core, outerScope(c.var.user, c.var.perspective), {
      locale: body.locale,
    });

    await resolveRichtext(core, inner(core, scope, undefined, {}), [body.document]);

    return c.json(body.document);
  });
}

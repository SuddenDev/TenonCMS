import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { inner, outerScope } from "../../cms/runtime/operation-context.ts";
import { withLocale } from "../../content/locale.ts";
import { ValidationError } from "../../errors.ts";
import { checkRichtextShape } from "../../richtext/runtime/validation.ts";
import { resolveRichtext } from "../../richtext/reads/resolve-richtext.ts";
import { resolveReferences } from "../reads/resolve-links.ts";

/**
 * `POST /admin/links/resolve`: resolves `references` to `{ href, title, broken }`, or decorates an unsaved rich text
 * `document`, in the perspective of the preview cookie. Nothing is persisted and no target data is exposed.
 * @returns The route. A malformed body or locale answers 400.
 */
export function linkResolveEndpoint(core: Core) {
  return new Hono<Env>().post("/admin/links/resolve", async (c) => {
    const body = await c.req.json().catch(() => null);
    const references = body?.references;

    if (references === undefined) {
      try {
        checkRichtextShape(body?.document);
      } catch {
        throw new ValidationError({ document: "Invalid rich text document" });
      }
    } else if (
      !Array.isArray(references) ||
      references.length > 1000 ||
      !references.every(isReference)
    )
      throw new ValidationError({ references: "Invalid references" });

    if (body.locale !== undefined && typeof body.locale !== "string")
      throw new ValidationError({ locale: "Invalid locale" });

    const scope = withLocale(
      core,
      outerScope({ user: c.var.user, perspective: c.var.perspective }),
      { locale: body.locale },
    );
    const s = inner(core, scope, undefined, {});

    if (references) return c.json(await resolveReferences(core, s, references));

    await resolveRichtext(core, s, [body.document]);
    return c.json(body.document);
  });
}

const isReference = (r: unknown): r is { collection: string; id: string } =>
  !!r &&
  typeof r === "object" &&
  typeof (r as any).collection === "string" &&
  typeof (r as any).id === "string";

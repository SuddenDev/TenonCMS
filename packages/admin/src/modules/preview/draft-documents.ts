import type { Fields } from "@/shared/api";
import type { LinkReference, LinkResolution } from "../../../../core/src/links/config/types";
import { withSuffix } from "../../../../core/src/links/runtime/url";
import { itemFields } from "../../../../core/src/schema/traversal/item-fields";

type Load = (collection: string, id: string) => Promise<unknown>;
type ResolveLink = (reference: LinkReference) => Promise<LinkResolution>;

/**
 * Replaces the ids of image, file and relation fields in a draft with their documents, and adds `href` and `title` to
 * `link` values, so a page can show them as it shows a read. A media id that does not load becomes `null`. A relation
 * id that does not load stays an id.
 */
export async function resolveDraft(
  fields: Fields,
  data: Record<string, any>,
  load: Load,
  resolveLink: ResolveLink,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...data };

  for (const [k, f] of Object.entries(fields)) {
    const v = data[k];
    if (!v) continue;

    if (f.type === "group") out[k] = await resolveDraft(f.fields, v, load, resolveLink);
    else if (f.type === "array" || f.type === "blocks")
      out[k] = await Promise.all(
        v.map((item: Record<string, any>) => {
          const inner = itemFields(f, item);
          return inner ? resolveDraft(inner, item, load, resolveLink) : item;
        }),
      );
    else if (f.type === "image" || f.type === "file") {
      const one = (id: string) => load("media", id).catch(() => null);
      out[k] = await (Array.isArray(v) ? Promise.all(v.map(one)) : one(v));
    } else if (f.type === "relation") {
      const one = (id: string) => load(f.collection, id).catch(() => id);
      out[k] = await (Array.isArray(v) ? Promise.all(v.map(one)) : one(v));
    } else if (f.type === "link") out[k] = await resolvedLink(v, resolveLink);
  }

  return out;
}

async function resolvedLink(value: Record<string, any>, resolveLink: ResolveLink) {
  const out: Record<string, any> = value.reference
    ? { ...value, ...(await resolveLink(value.reference)) }
    : { ...value };
  if (out.href && out.suffix) out.href = withSuffix(out.href, out.suffix);
  return out;
}

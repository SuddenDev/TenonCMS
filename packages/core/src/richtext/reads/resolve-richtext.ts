import type { Core, Inner } from "../../cms/runtime/types.ts";
import { resolveLinkTargets } from "../../links/reads/resolve-targets.ts";
import { linkKey } from "../../links/runtime/value.ts";
import { safeLinkUrl } from "../../links/runtime/url.ts";
import { richtextReferences } from "../runtime/walk.ts";
import type { RichtextDocument } from "../config/types.ts";

/** Decorates the links and images of rich text values in place, with one load per target collection. */
export async function resolveRichtext(core: Core, scope: Inner, values: RichtextDocument[]) {
  const refs = values.flatMap(richtextReferences);
  const targets = await resolveLinkTargets(
    core,
    scope,
    refs.map((r) => r.reference),
  );

  for (const { node, reference: ref } of refs) {
    const target = ref.deleted ? undefined : targets.get(linkKey(ref));
    const safe = target?.href ?? null;
    node.attrs!.broken = !safe;

    if (node.type === "image") {
      const src = target?.doc.src ?? safe;
      node.attrs!.src = safe && safeLinkUrl(src) ? src : null;
      node.attrs!.srcset = safe ? (target?.doc.srcset ?? null) : null;
    } else {
      node.attrs!.href = safe;
      if (node.attrs!.target === "_blank") node.attrs!.rel = "noopener noreferrer";
    }
  }
}

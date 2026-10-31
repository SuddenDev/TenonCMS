import type { Core, Inner } from "../../cms/runtime/types.ts";
import type { LinkReference, LinkResolution } from "../config/types.ts";
import { linkKey } from "../runtime/value.ts";
import { resolveLinkTargets } from "./resolve-targets.ts";

/**
 * Adds `href`, `title` and `broken` to the stored values of `link` fields in place, with one load per target
 * collection. A URL value keeps its `href`.
 */
export async function resolveLinks(core: Core, scope: Inner, values: Record<string, any>[]) {
  const linked = values.filter((v) => v.reference);
  const resolved = await resolveReferences(
    core,
    scope,
    linked.map((v) => v.reference),
  );

  linked.forEach((value, i) => Object.assign(value, resolved[i]));
}

/** What each reference resolves to, in the order of `references`. */
export async function resolveReferences(
  core: Core,
  scope: Inner,
  references: LinkReference[],
): Promise<LinkResolution[]> {
  const targets = await resolveLinkTargets(core, scope, references);

  return references.map((ref) => {
    const target = ref.deleted ? undefined : targets.get(linkKey(ref));
    if (!target?.href) return { href: null, broken: true };
    return { href: target.href, ...(target.title !== undefined && { title: target.title }) };
  });
}

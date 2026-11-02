import type { Core, Inner } from "../../cms/runtime/types.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { collectionTarget } from "../../content/targets.ts";
import { locOf } from "../../content/reads/loc-of.ts";
import { beforeRead, afterRead } from "../../content/lifecycle/run-read-hooks.ts";
import { loadByIds } from "../../db/queries/documents/load-by-ids.query.ts";
import { permalinkUrl } from "../../preview/server/resolve-url.ts";
import { decorate } from "../../media/images/decorate.ts";
import { readDecision, admittedRows } from "../../access/read.ts";
import type { LinkReference } from "../config/types.ts";
import { linkKey } from "../runtime/value.ts";
import { linkTitleKey } from "../runtime/title-key.ts";
import { safeLinkUrl } from "../runtime/url.ts";

/** A loaded link target. `doc` is the target as its read hooks return it; a media document is decorated. */
export type ResolvedTarget = { href: string | null; title?: string; doc: Record<string, any> };

/**
 * Loads the targets of `references` in the scope's perspective and locale, one load per collection, within each
 * collection's read rule and read hooks. `href` is the `permalink`, or the URL of a media file. Preview URLs are never used.
 * @returns The targets by {@link linkKey}. A deleted, unknown, unreadable or missing target has no entry.
 */
export async function resolveLinkTargets(core: Core, scope: Inner, references: LinkReference[]) {
  const groups = new Map<string, Set<string>>();

  for (const ref of references) {
    if (ref.deleted) continue;

    if (!groups.has(ref.collection)) groups.set(ref.collection, new Set());
    groups.get(ref.collection)!.add(ref.id);
  }

  const resolved = new Map<string, ResolvedTarget>();
  const db = await databaseForScope(core, scope);

  for (const [collection, ids] of groups) {
    const entry = core.schema.collections[collection];
    if (!entry) continue;

    const drafts = scope.perspective === "drafts";
    const access = await readDecision(core, scope, collectionTarget(collection));
    if (access === false) continue;
    const loaded = await loadByIds(
      db,
      collection,
      [...ids],
      drafts,
      await locOf(core, scope, collectionTarget(collection)),
    );
    const docs = admittedRows(access, loaded);

    const before = await beforeRead(core, scope, collectionTarget(collection), docs, "read");
    const after = await afterRead(core, scope, collectionTarget(collection), before, "read");
    const titleKey = linkTitleKey(entry);

    for (const doc of after) {
      const key = linkKey({ collection, id: doc.id });
      const title = titleKey && typeof doc[titleKey] === "string" ? doc[titleKey] : undefined;

      if (collection === "media" && core.media) {
        const media = decorate(core.media, doc);
        resolved.set(key, { href: safeUrl(media.url), title, doc: media });
      } else {
        const url = await permalinkUrl(entry, doc, scope.cms, {
          locale: scope.locale,
          localization: core.localization,
        });
        resolved.set(key, { href: safeUrl(url), title, doc });
      }
    }
  }

  return resolved;
}

const safeUrl = (url: unknown) => (safeLinkUrl(url) ? url : null);

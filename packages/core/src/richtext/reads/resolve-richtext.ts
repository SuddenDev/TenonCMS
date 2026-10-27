import type { Core, Inner } from "../../cms/runtime/types.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { collectionTarget } from "../../content/targets.ts";
import { locOf } from "../../content/reads/loc-of.ts";
import { beforeRead, afterRead } from "../../content/lifecycle/run-read-hooks.ts";
import { loadByIds } from "../../db/queries/documents/load-by-ids.query.ts";
import { permalinkUrl } from "../../preview/server/resolve-url.ts";
import { decorate } from "../../media/images/decorate.ts";
import { richtextReferences } from "../runtime/walk.ts";
import { safeRichtextUrl } from "../runtime/validation.ts";
import type { RichtextDocument } from "../config/types.ts";
import { readDecision, admittedRows } from "../../access/read.ts";

/** Resolves one rich text field across all owners, with one load per target collection. */
export async function resolveRichtext(core: Core, scope: Inner, values: RichtextDocument[]) {
  const refs = values.flatMap(richtextReferences);
  const groups = new Map<string, Set<string>>();

  for (const { reference: ref } of refs) {
    if (ref.deleted) continue;

    if (!groups.has(ref.collection)) groups.set(ref.collection, new Set());
    groups.get(ref.collection)!.add(ref.id);
  }

  const resolved = new Map<string, Record<string, any>>();
  const urls = new Map<string, string | null>();
  const db = await databaseForScope(core, scope);

  for (const [collection, ids] of groups) {
    const entry = core.schema.collections[collection];
    if (!entry) continue;

    const drafts = scope.perspective === "drafts";
    const access = await readDecision(core, scope, collectionTarget(collection));
    if (access === false) continue;
    const loaded = await loadByIds(db, collection, [...ids], drafts, locOf(core, scope, entry));
    const docs = admittedRows(access, loaded);

    const before = await beforeRead(core, scope, collectionTarget(collection), docs, "read");
    const after = await afterRead(core, scope, collectionTarget(collection), before, "read");

    for (const doc of after) {
      const key = `${collection}:${doc.id}`;
      if (collection === "media" && core.media) {
        const media = decorate(core.media, doc);
        resolved.set(key, media);
        urls.set(key, media.url);
      } else {
        resolved.set(key, doc);
        urls.set(
          key,
          await permalinkUrl(entry, doc, scope.cms, {
            locale: scope.locale,
            localization: core.localization,
          }),
        );
      }
    }
  }

  for (const { node, reference: ref } of refs) {
    const key = `${ref.collection}:${ref.id}`;
    const url = ref.deleted ? null : (urls.get(key) ?? null);
    const safe = url && safeRichtextUrl(url) ? url : null;
    node.attrs!.broken = !safe;

    if (node.type === "image") {
      const image = resolved.get(key);
      const src = image?.src ?? safe;
      node.attrs!.src = safe && safeRichtextUrl(src) ? src : null;
      node.attrs!.srcset = safe ? (resolved.get(key)?.srcset ?? null) : null;
    } else {
      node.attrs!.href = safe;
      if (node.attrs!.target === "_blank") node.attrs!.rel = "noopener noreferrer";
    }
  }
}

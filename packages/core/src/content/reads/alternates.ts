import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { inner } from "../../cms/runtime/operation-context.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { loadByIds } from "../../db/queries/documents/load-by-ids.query.ts";
import { permalinkUrl } from "../../preview/server/resolve-url.ts";
import { afterRead } from "../lifecycle/run-read-hooks.ts";
import { col } from "../targets.ts";
import { locOf } from "./loc-of.ts";

/**
 * Adds `alternates` to documents of a localized collection that has a `permalink`: the public URL of each locale the
 * document is published in, and `"x-default"`, the default locale's URL. A locale whose `permalink` resolves to
 * `null` is left out. It describes public URLs, so it reads the published perspective in every perspective.
 * Costs one batched read per locale.
 * @returns The documents, with `alternates` where the collection supports it.
 */
export async function addAlternates(
  core: Core,
  s: Inner,
  collection: string,
  docs: Record<string, any>[],
) {
  const entry = core.schema.collections[collection];
  const l = core.localization;
  if (!l || !entry.localized || !entry.permalink || !docs.length) return docs;

  const ids = docs.map((d) => d.id as string);
  const urls = new Map<string, Record<string, string>>(ids.map((id) => [id, {}]));
  const db = await q(core, s);

  for (const locale of l.locales) {
    const scope = inner(
      core,
      { ...s, perspective: "published", locale, fallback: false },
      s.trx,
      s.context,
    );
    const loc = locOf(core, scope, entry);
    const found = await afterRead(
      core,
      scope,
      col(collection),
      await loadByIds(db, collection, ids, false, loc),
      "read",
    );

    for (const doc of found) {
      const url = await permalinkUrl(entry, doc, scope.cms, { locale, localization: l });
      if (url !== null) urls.get(doc.id)![locale] = url;
    }
  }

  return docs.map((doc) => {
    const alternates = urls.get(doc.id)!;
    const main = alternates[l.defaultLocale];
    return {
      ...doc,
      alternates: main === undefined ? alternates : { ...alternates, "x-default": main },
    };
  });
}

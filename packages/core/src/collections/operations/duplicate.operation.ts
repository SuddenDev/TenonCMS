import type { Core, Scope } from "../../cms/runtime/types.ts";
import type { LocalApi } from "../../cms/api/local-api.ts";
import type { Collection } from "../config/types.ts";
import { transaction } from "../../cms/runtime/transaction.ts";
import { linkTitleKey } from "../../links/runtime/title-key.ts";
import { localizedKeys } from "../../schema/traversal/localized-fields.ts";

type Row = Record<string, unknown>;

/**
 * Copies a document into a new one, every locale, as a draft (a save with `drafts: false`). The title gets ` (copy)`.
 * A slug or unique text value gets `-copy`, then `-copy-2` and so on until no document holds it. Other unique values
 * are cleared. Reads and writes run as the caller, in one transaction.
 * @returns The copy in its first locale, or `undefined` when the source does not exist.
 */
export const duplicate = (core: Core, scope: Scope, collection: string, id: string) =>
  transaction(core, scope, async (s) => {
    const cms = core.localApi({ ...scope, transaction: s.transaction, perspective: "drafts" });
    const read = (locale?: string) =>
      cms.findById(collection, id, { locale, fallback: false, populate: false });
    const source = await read();
    if (!source) return undefined;

    const entry = core.schema.collections[collection];
    const options = { draft: entry.drafts !== false };
    const keys = Object.keys(entry.fields).filter((k) => entry.fields[k].type !== "join");
    // The read locale (the default) comes first: the create writes the shared values.
    const at = source.locale as string | undefined;
    const others = ((source.locales as string[] | undefined) ?? []).filter((l) => l !== at);
    const [first, rest] = [at, others];
    const copy = await cms.create(
      collection,
      await copyValues(s.cms, collection, entry, source, keys, first),
      { ...options, locale: first },
    );
    // Shared values come from the first locale only, so later locales add no shared draft.
    for (const locale of rest)
      await cms.update(
        collection,
        copy.id as string,
        await copyValues(
          s.cms,
          collection,
          entry,
          (await read(locale))!,
          localizedKeys(entry),
          locale,
        ),
        { ...options, locale },
      );
    return copy;
  });

async function copyValues(
  all: LocalApi,
  collection: string,
  entry: Collection,
  doc: Row,
  keys: string[],
  locale: string | undefined,
) {
  // A slug names the document even without `unique`, e.g. when a hook checks the path it builds.
  const isUnique = (key: string) =>
    entry.fields[key].type === "slug" ||
    ("unique" in entry.fields[key] && !!entry.fields[key].unique);
  const data = Object.fromEntries(keys.filter((k) => k in doc).map((k) => [k, doc[k]]));

  const title = linkTitleKey(entry);
  if (title && keys.includes(title) && !isUnique(title) && typeof data[title] === "string")
    data[title] += " (copy)";
  for (const key of keys.filter(isUnique)) {
    const value = data[key];
    if (value == null) continue;
    data[key] =
      typeof value === "string" ? await freeValue(all, collection, key, value, locale) : null;
  }
  return data;
}

// The first `<value>-copy`, `<value>-copy-2`, … that no document holds, published or as a draft.
async function freeValue(
  all: LocalApi,
  collection: string,
  key: string,
  value: string,
  locale: string | undefined,
) {
  const taken = async (candidate: string) => {
    const options = { where: { [key]: candidate }, locale, fallback: false, limit: 1 };
    return (
      (await all.find(collection, options)).length > 0 ||
      (await all.withDrafts().find(collection, options)).length > 0
    );
  };
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${value}-copy` : `${value}-copy-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
}

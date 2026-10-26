import type { Fields } from "@/shared/api";

/** A document or global the page renders. `id` is `''` for a global. */
export type PageDocument = { collection: string; id: string };
/** One row of "On this page": a document, its key, and how far below the page's own documents it sits. */
export type PageRow = PageDocument & { key: string; depth: number };
type Entry = { fields: Fields; visualEditing?: boolean };

/** The key of a document, as in the preview protocol. */
export const keyOf = (d: PageDocument) => `${d.collection}:${d.id}`;

/**
 * The rows of "On this page": the page's documents in page order, each followed by the documents its relations point
 * to, depth first. Each document shows once, where it first appears. An unknown entry, or one with
 * `visualEditing: false`, is left out with what it points to.
 * @param entryOf The schema entry of a document.
 * @param dataOf The stored data of a document by key, without populate, so relations hold ids.
 * @returns The rows.
 */
export function pageRows(
  documents: PageDocument[],
  entryOf: (d: PageDocument) => Entry | undefined,
  dataOf: (key: string) => Record<string, any> | null | undefined,
) {
  const seen = new Set<string>();
  const rows: PageRow[] = [];

  const visit = (d: PageDocument, depth: number) => {
    const key = keyOf(d);
    const entry = entryOf(d);
    if (seen.has(key) || !entry || entry.visualEditing === false) return;
    seen.add(key);
    rows.push({ ...d, key, depth });
    for (const r of refsOf(entry.fields, dataOf(key))) visit(r, depth + 1);
  };
  for (const d of documents) visit(d, 0);

  return rows;
}

// Relation ids at the top level and in groups. The media library has no presentation route.
function refsOf(fields: Fields, value: Record<string, any> | null | undefined): PageDocument[] {
  return Object.entries(fields).flatMap(([k, f]): PageDocument[] => {
    const v = value?.[k];
    if (f.type === "group") return refsOf(f.fields, v);
    if (f.type !== "relation" || f.collection === "media") return [];
    return [v]
      .flat()
      .filter((id) => typeof id === "string")
      .map((id) => ({ collection: f.collection, id }));
  });
}

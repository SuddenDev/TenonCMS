import { consola } from "consola";
import { type Kysely, type Transaction, sql } from "kysely";
import { type Database } from "../types.ts";

type Obj = Record<string, unknown>;
type Version = { data: Obj; draft: Obj | null };
type Kind = "collection" | "global";

// `meta` holds the default locale, to warn when it changes.
const META = { kind: "meta", name: "defaultLocale" } as const;

const tables = {
  collection: {
    rows: "cms_documents",
    id: "id",
    locales: "cms_document_locales",
    fk: "document_id",
  },
  global: { rows: "cms_globals", id: "name", locales: "cms_global_locales", fk: "name" },
} as const;

const parse = (s: string | null) => (s === null ? null : (JSON.parse(s) as Obj));
const text = (o: Obj | null) => (o === null ? null : JSON.stringify(o));

// Moves `keys` between the two versions, drafts included. A draft is the full pending version.
function shift(from: Version, to: Version, keys: string[]) {
  const before = { ...from.data };
  const base = { ...to.data };
  const fromDraft = from.draft;
  if (fromDraft) to.draft ??= { ...base };
  const moved = new Set<string>();
  for (const k of keys) {
    const view = fromDraft ?? before;
    if (k in before || (fromDraft && k in fromDraft)) moved.add(k);
    if (k in before) to.data[k] = before[k];
    delete from.data[k];
    if (to.draft) {
      if (k in view) to.draft[k] = view[k];
      else delete to.draft[k];
    }
    if (fromDraft) delete fromDraft[k];
  }
  return moved;
}

async function move(
  trx: Transaction<Database>,
  kind: Kind,
  name: string,
  keys: string[],
  toLocale: boolean,
  locale: string,
) {
  const t = tables[kind];
  const owners = await sql<{
    id: string;
    data: string;
    draft: string | null;
    created_at: number;
    updated_at: number;
    published_at: number | null;
  }>`SELECT ${sql.ref(t.id)} AS id, data, draft, created_at, updated_at, published_at
    FROM ${sql.table(t.rows)}
    WHERE ${kind === "collection" ? sql`collection = ${name}` : sql`name = ${name}`}`.execute(trx);
  // ponytail: rows are read into memory; batch by id if collections get large.
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const o of owners.rows) {
    const found = await sql<{ data: string; draft: string | null }>`SELECT data, draft
      FROM ${sql.table(t.locales)} WHERE ${sql.ref(t.fk)} = ${o.id} AND locale = ${locale}`.execute(
      trx,
    );
    const row = found.rows[0];
    if (!row && !toLocale) continue;
    const shared: Version = { data: JSON.parse(o.data), draft: parse(o.draft) };
    const local: Version = row
      ? { data: JSON.parse(row.data), draft: parse(row.draft) }
      : { data: {}, draft: null };
    const moved = toLocale ? shift(shared, local, keys) : shift(local, shared, keys);
    for (const k of moved) counts.set(k, counts.get(k)! + 1);
    await sql`UPDATE ${sql.table(t.rows)} SET data = ${text(shared.data)}, draft = ${text(shared.draft)}
      WHERE ${sql.ref(t.id)} = ${o.id}`.execute(trx);
    await sql`INSERT INTO ${sql.table(t.locales)} (${sql.ref(t.fk)}, locale, data, draft, created_at, updated_at, published_at)
      VALUES (${o.id}, ${locale}, ${text(local.data)}, ${text(local.draft)}, ${o.created_at}, ${o.updated_at}, ${o.published_at})
      ON CONFLICT (${sql.ref(t.fk)}, locale) DO UPDATE SET data = excluded.data, draft = excluded.draft`.execute(
      trx,
    );
  }
  return counts;
}

async function missingDefault(
  db: Kysely<Database>,
  current: Record<string, string[] | null>,
  locale: string,
) {
  let total = 0;
  for (const [id, keys] of Object.entries(current)) {
    if (!keys) continue;
    const [kind, name] = split(id);
    const t = tables[kind];
    const { rows } = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM ${sql.table(t.rows)} r
      WHERE ${kind === "collection" ? sql`r.collection = ${name}` : sql`r.name = ${name}`}
      AND NOT EXISTS (SELECT 1 FROM ${sql.table(t.locales)} l
        WHERE l.${sql.ref(t.fk)} = r.${sql.ref(t.id)} AND l.locale = ${locale})`.execute(db);
    total += Number(rows[0]!.n);
  }
  return total;
}

function split(id: string): [Kind, string] {
  const i = id.indexOf(":");
  return [id.slice(0, i) as Kind, id.slice(i + 1)];
}

/**
 * Moves values between shared data and the default locale's row when the localized
 * keys of a collection or global change, then stores the new state.
 * The first run, with an empty state, records only. Other locales keep their rows.
 * A changed `defaultLocale` moves nothing and warns about documents without a row in it.
 * @param current `collection:<name>` / `global:<name>` to the top-level localized keys, or `null` when not localized.
 */
export async function syncLocalized(
  db: Kysely<Database>,
  current: Record<string, string[] | null>,
  defaultLocale: string,
) {
  const stored = await db.selectFrom("cms_schema_state").selectAll().execute();
  const prev = new Map<string, string[] | null>();
  let prevDefault: string | undefined;
  for (const r of stored) {
    if (r.kind === META.kind) prevDefault = JSON.parse(r.localized!) as string;
    else prev.set(`${r.kind}:${r.name}`, r.localized === null ? null : JSON.parse(r.localized));
  }
  const log = consola.withTag("integral");
  const messages: string[] = [];

  await db.transaction().execute(async (trx) => {
    if (stored.length)
      for (const [id, keys] of Object.entries(current)) {
        const before = prev.get(id) ?? [];
        const after = keys ?? [];
        const [kind, name] = split(id);
        for (const [list, toLocale] of [
          [after.filter((k) => !before.includes(k)), true],
          [before.filter((k) => !after.includes(k)), false],
        ] as const) {
          if (!list.length) continue;
          const counts = await move(trx, kind, name, list, toLocale, defaultLocale);
          for (const [k, n] of counts)
            if (n)
              messages.push(
                `moved ${name}.${k} to ${toLocale ? "locale rows" : "shared data"} (${n} documents)`,
              );
        }
      }
    const rows = [
      ...Object.entries(current).map(([id, keys]) => {
        const [kind, name] = split(id);
        return { kind, name, localized: keys && JSON.stringify(keys) };
      }),
      { ...META, localized: JSON.stringify(defaultLocale) },
    ];
    for (const row of rows)
      await trx
        .insertInto("cms_schema_state")
        .values(row)
        .onConflict((oc) => oc.columns(["kind", "name"]).doUpdateSet({ localized: row.localized }))
        .execute();
  });

  for (const m of messages) log.info(m);
  if (prevDefault !== undefined && prevDefault !== defaultLocale) {
    const n = await missingDefault(db, current, defaultLocale);
    if (n)
      log.warn(
        `defaultLocale changed from "${prevDefault}" to "${defaultLocale}": ${n} documents have no "${defaultLocale}" row`,
      );
  }
}

import type { Db } from "../../db/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { mediaIdsByKey } from "../../db/queries/media/media-by-key.query.ts";
import { cleanFolder, cleanName, keyOf } from "../../media/library/names.ts";
import { type ArchiveCheck, FORMAT, FORMAT_VERSION, type ImportMode } from "../format.ts";
import { type ArchiveManifest, mediaData, parseJson, requireShape } from "../read-archive.ts";
import { countArchive, databaseState } from "./count-archive.ts";
import { fullTables } from "./full-tables.ts";

/**
 * Checks whether an archive can be imported here, without writing anything.
 * @param targets The `collection:<name>` and `global:<name>` the rows use. `undefined` skips the checks that need
 * them, for an archive of format version 1 that is checked from its manifest alone.
 * @param media The media documents of the rows. `undefined` skips the checks of their keys.
 * @returns The errors, what is stored now and what the archive holds. See {@link ArchiveCheck}.
 */
export async function checkArchive(
  core: Core,
  db: Db,
  manifest: ArchiveManifest | undefined,
  { mode, targets, media }: { mode: ImportMode; targets?: string[]; media?: ArchiveMedia[] },
): Promise<ArchiveCheck> {
  const errors = manifestErrors(manifest);
  if (manifest && !errors.length) {
    if (targets) errors.push(...unknownTargets(core, targets));
    if (targets && mode !== "replace") errors.push(...localizedErrors(core, manifest, targets));
    if (manifest.scope === "full") errors.push(...(await fullErrors(core, db, manifest, mode)));
    if (media) errors.push(...(await mediaErrors(db, media, mode)));
  }
  const deletes = await countArchive(core, db, {
    scope: manifest?.scope,
    media: manifest?.media,
  });
  return { errors, deletes, writes: manifest?.counts ?? null };
}

type Row = Record<string, unknown>;

/** The `collection:<name>` and `global:<name>` that the rows of an archive use. */
export function archiveTargets(rows: { documents: Row[]; globals: Row[]; versions: Row[] }) {
  return [
    ...new Set([
      ...rows.documents.map((r) => `collection:${r.collection}`),
      ...rows.globals.map((r) => `global:${r.name}`),
      ...rows.versions.map((r) => r.target as string),
    ]),
  ];
}

export type ArchiveMedia = {
  id: string;
  key: string;
  folder?: string;
  filename?: string;
  mimeType?: string;
};

/**
 * The media documents among the document rows of an archive.
 * @throws {ValidationError} On `archive` for a media row whose `data` is not a JSON object with a string `key`.
 */
export const archiveMedia = (documents: Row[]): ArchiveMedia[] =>
  documents.flatMap((r, i) => {
    if (r.collection !== "media") return [];
    const where = `documents.ndjson row ${i + 1}`;
    const data = requireShape(mediaData, parseJson(String(r.data)), where);
    return [{ ...data, id: String(r.id) }];
  });

// A key MUST follow the media library's rules. In `merge` and `missing` it MUST NOT belong to another document here.
async function mediaErrors(db: Db, media: ArchiveMedia[], mode: ImportMode) {
  const invalid = media.filter((m) => !isMediaKey(m)).map((m) => m.key);
  if (invalid.length) return [`The archive has invalid media keys: ${invalid.join(", ")}.`];
  if (mode === "replace") return [];
  const owners = await mediaIdsByKey(
    db,
    media.map((m) => m.key),
  );
  const taken = media.filter((m) => (owners.get(m.key) ?? m.id) !== m.id).map((m) => m.key);
  return taken.length
    ? [
        `Other media files here use the keys ${taken.join(", ")}. Rename them, or import with mode "replace".`,
      ]
    : [];
}

function isMediaKey({ key, folder, filename }: ArchiveMedia) {
  try {
    return keyOf(cleanFolder(folder ?? ""), cleanName(filename ?? "")) === key;
  } catch {
    return false;
  }
}

function manifestErrors(manifest: ArchiveManifest | undefined) {
  if (manifest?.format !== FORMAT) return ["Not a tenon archive"];
  if (manifest.version > FORMAT_VERSION)
    return [
      `The archive has format version ${manifest.version}, this version reads up to ${FORMAT_VERSION}`,
    ];
  return [];
}

function unknownTargets(core: Core, targets: string[]) {
  const { collections, globals } = core.schema;
  const unknown = targets.filter((id) => {
    const i = id.indexOf(":");
    return !(id.slice(0, i) === "collection" ? collections : globals)[id.slice(i + 1)];
  });
  return unknown.length
    ? [`The schema has no ${unknown.join(", ")}. Add them, or edit the archive.`]
    : [];
}

// Only `replace` moves stored values between shared and locale rows, so the other modes need the config's layout.
function localizedErrors(core: Core, manifest: ArchiveManifest, targets: string[]) {
  const { current, defaultLocale } = core.localized;
  const key = (keys: string[] | null | undefined) => JSON.stringify([...(keys ?? [])].sort());
  const differs = targets.filter((id) => key(manifest.localized[id]) !== key(current[id]));
  const localized = targets.some((id) => current[id]);
  return differs.length || (localized && manifest.defaultLocale !== defaultLocale)
    ? [
        `The archive stores other localized fields (${differs.join(", ") || "defaultLocale"}). Import it with mode "replace", or export it again on this config.`,
      ]
    : [];
}

// ponytail: a full archive needs the same dialect and migrations. Normalize auth rows per column to move between them.
async function fullErrors(core: Core, db: Db, manifest: ArchiveManifest, mode: ImportMode) {
  if (mode !== "replace") return ['A full archive imports with mode "replace" only.'];
  const errors: string[] = [];
  const here = await databaseState(db);
  if (manifest.dialect !== here.dialect)
    errors.push(
      `The archive comes from a ${manifest.dialect} database, this one is ${here.dialect}. A full archive restores only into the same kind of database.`,
    );
  const archived = manifest.migrations ?? [];
  const onlyArchive = archived.filter((m) => !here.migrations.includes(m));
  const onlyHere = here.migrations.filter((m) => !archived.includes(m));
  if (onlyArchive.length || onlyHere.length)
    errors.push(
      `The archive was made with other migrations (archive only: ${onlyArchive.join(", ") || "none"}; here only: ${onlyHere.join(", ") || "none"}). Install the tenoncms version the backup was made with.`,
    );
  const columns = new Map((await fullTables(core, db)).map((t) => [t.name, new Set(t.columns)]));
  for (const [table, cols] of Object.entries(manifest.tables ?? {})) {
    const missing = cols.filter((c) => !columns.get(table)?.has(c));
    if (!columns.has(table)) errors.push(`This database has no table ${table}.`);
    else if (missing.length) errors.push(`The table ${table} has no ${missing.join(", ")} here.`);
  }
  return errors;
}

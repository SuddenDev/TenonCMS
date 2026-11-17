import { z } from "zod";
import { ValidationError } from "../errors.ts";
import { ARCHIVE_SCOPES, FORMAT, MANIFEST, type TableName } from "./format.ts";
import type { ZipEntry } from "./read-zip.ts";

// Server only. The client imports `format.ts`, so zod MUST stay out of it.

const counts = z.object({
  tables: z.record(z.string(), z.number()),
  media: z.object({ files: z.number(), bytes: z.number() }),
});

/** The fields of `manifest.json` that a check or an import reads. Other fields pass through. */
export const manifestSchema = z.looseObject({
  format: z.string(),
  version: z.number(),
  defaultLocale: z.string(),
  localized: z.record(z.string(), z.array(z.string()).nullable()),
  media: z.boolean(),
  scope: z.enum(ARCHIVE_SCOPES).optional(),
  dialect: z.string().optional(),
  migrations: z.array(z.string()).optional(),
  tables: z.record(z.string(), z.array(z.string())).optional(),
  targets: z.array(z.string()).optional(),
  counts: counts.optional(),
});

/** A manifest that {@link manifestSchema} accepts. */
export type ArchiveManifest = z.infer<typeof manifestSchema>;

const text = z.string();

/** The columns of each content table that the import reads. Every row MUST have them as strings. */
export const ROWS: Record<TableName, z.ZodType<Record<string, unknown>>> = {
  cms_documents: z.looseObject({ id: text, collection: text, data: text }),
  cms_document_locales: z.looseObject({ document_id: text, locale: text, data: text }),
  cms_globals: z.looseObject({ name: text, data: text }),
  cms_global_locales: z.looseObject({ name: text, locale: text, data: text }),
  cms_versions: z.looseObject({ id: text, target: text, doc_id: text, data: text }),
};

/** A row of an extra table of a `full` archive: any object. */
export const ANY_ROW = z.record(z.string(), z.unknown());

/** The `data` of a media document row. */
export const mediaData = z.looseObject({
  key: text,
  folder: text.optional(),
  filename: text.optional(),
  mimeType: text.optional(),
});

/**
 * The manifest of an archive's entries.
 * @returns `undefined` when there is none, or it is not JSON of a tenon archive.
 * @throws {ValidationError} On `archive` for a tenon manifest of the wrong shape.
 */
export async function readManifest(entries: Map<string, ZipEntry>) {
  const entry = entries.get(MANIFEST);
  const value = entry && parseJson(await new Response(entry.stream()).text());
  const tenon = z.looseObject({ format: z.literal(FORMAT) }).safeParse(value).success;
  return tenon ? requireShape(manifestSchema, value, MANIFEST) : undefined;
}

/**
 * The rows of an NDJSON entry, each checked against `schema`. A missing entry has no rows.
 * @throws {ValidationError} On `archive`, naming the entry and line of the first line that is not JSON or has the
 * wrong shape.
 */
export async function readNdjson<T>(
  entries: Map<string, ZipEntry>,
  name: string,
  schema: z.ZodType<T>,
) {
  const entry = entries.get(name);
  const lines = entry ? (await new Response(entry.stream()).text()).split("\n") : [];
  const rows: T[] = [];
  for (const [i, line] of lines.entries()) {
    if (!line) continue;
    const value = parseJson(line);
    if (value === undefined)
      throw new ValidationError({ archive: `${name} line ${i + 1} is not JSON` });
    rows.push(requireShape(schema, value, `${name} line ${i + 1}`));
  }
  return rows;
}

/**
 * `value` as `schema` describes it.
 * @param where Where the value sits in the archive, for the message.
 * @throws {ValidationError} On `archive`, with the path of the first wrong field. It never repeats the value.
 */
export function requireShape<T>(schema: z.ZodType<T>, value: unknown, where: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const [issue] = result.error.issues;
  const path = issue?.path.join(".");
  throw new ValidationError({
    archive: `${where} is invalid${path ? ` at ${path}` : ""}: ${issue?.message}`,
  });
}

/** `text` as JSON, or `undefined` for text that is not JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

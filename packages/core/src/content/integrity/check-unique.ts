import { type Database } from "../../db/types.ts";
import { type Fields } from "../../schema/index.ts";
import { taken } from "../../db/queries/references/value-taken.query.ts";
import { ValidationError } from "../../errors.ts";
import type { Kysely } from "kysely";

// ponytail: one scan per unique field per write. Add SQLite expression indexes if collections grow large.
export async function checkUnique(
  db: Kysely<Database>,
  collection: string,
  fields: Fields,
  data: Record<string, unknown>,
  id?: string,
) {
  const errors: Record<string, string> = {};
  for (const [key, f] of Object.entries(fields)) {
    if (!("unique" in f) || !f.unique || data[key] == null) continue;
    if (await taken(db, collection, key, data[key], id)) errors[key] = "Already used";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

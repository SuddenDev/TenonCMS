import type { DatabaseOptions } from "../../db/create-db.ts";
import type { Storage } from "../../media/storage/types.ts";

/**
 * Checks the options a running CMS needs, so a bad deploy fails at startup instead of on the first admin request.
 * `database` and `storage` report their own problems, from `libsql()`, `s3()` and the other factories.
 * @throws {Error} One error that lists every missing or invalid option.
 */
export function requireConfig(options: {
  secret: string | undefined;
  database: DatabaseOptions | undefined;
  storage: Storage | undefined;
}) {
  const { secret, database, storage } = options;
  const problems = [
    ...(!secret || secret.length < 32 ? ["`secret` MUST be at least 32 characters"] : []),
    ...(database?.dialect
      ? (database.problems ?? []).map((p) => `\`database\`: ${p}`)
      : ["`database` is missing"]),
    ...(storage?.problems ?? []).map((p) => `\`media.storage\`: ${p}`),
  ];
  if (problems.length)
    throw new Error(`tenoncms: invalid config\n${problems.map((p) => `- ${p}`).join("\n")}`);
}

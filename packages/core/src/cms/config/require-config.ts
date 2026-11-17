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
  siteUrl: string | undefined;
}) {
  const { secret, database, storage, siteUrl } = options;
  const problems = [
    ...(!secret || secret.length < 32 ? ["`secret` MUST be at least 32 characters"] : []),
    ...(siteUrl && !isOrigin(siteUrl)
      ? ["`site.url` MUST be an HTTP(S) origin, without credentials, path, query or fragment"]
      : []),
    ...(database?.dialect
      ? (database.problems ?? []).map((p) => `\`database\`: ${p}`)
      : ["`database` is missing"]),
    ...(storage?.problems ?? []).map((p) => `\`media.storage\`: ${p}`),
  ];
  if (problems.length)
    throw new Error(`tenoncms: invalid config\n${problems.map((p) => `- ${p}`).join("\n")}`);
}

function isOrigin(value: string) {
  const url = URL.parse(value);
  return (
    !!url &&
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash
  );
}

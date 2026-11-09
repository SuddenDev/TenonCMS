/** Read options as the client methods accept them, before serialization. */
export type ReadQuery = {
  populate?: boolean | object;
  depth?: number;
  select?: object;
  locale?: string;
  fallback?: boolean;
  alternates?: boolean;
  permalink?: boolean;
};

// For `populate` and `select`: `{ author: { avatar: true } }` becomes `author.avatar`. An empty object ends a path too.
function paths(spec: object, prefix = ""): string[] {
  return Object.entries(spec).flatMap(([key, value]) =>
    value === true || (value && typeof value === "object" && !Object.keys(value).length)
      ? [prefix + key]
      : value && typeof value === "object"
        ? paths(value, `${prefix}${key}.`)
        : [],
  );
}

/**
 * Turns read options into query parameters. `select: {}` is sent as an empty `select=`, which returns only `id`.
 * A populate object with no paths is sent as `populate=false`, which returns ids.
 * @returns Query parameters. `depth`, `locale`, `fallback`, `alternates` and `permalink` are `undefined` when not set, so
 * `request()` drops them.
 */
export function readQuery({
  populate,
  depth,
  select,
  locale,
  fallback,
  alternates,
  permalink,
}: ReadQuery) {
  const query: Record<string, string | number | boolean | undefined> = {
    depth,
    locale,
    fallback,
    alternates,
    permalink,
  };
  if (populate === false) query.populate = "false";
  else if (typeof populate === "object") query.populate = paths(populate).join(",") || "false";
  if (select) query.select = paths(select).join(",");
  return query;
}

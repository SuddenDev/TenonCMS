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

// `select: {}` is sent as an empty `select=`, which returns only `id`. A populate object with no paths means ids.
export function readQuery({
  populate,
  depth,
  select,
}: {
  populate?: boolean | object;
  depth?: number;
  select?: object;
}) {
  const query: Record<string, string | number | undefined> = { depth };
  if (populate === false) query.populate = "false";
  else if (typeof populate === "object") query.populate = paths(populate).join(",") || "false";
  if (select) query.select = paths(select).join(",");
  return query;
}

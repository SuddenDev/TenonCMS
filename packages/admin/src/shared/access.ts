/** A permission as `/schema` sends it: `true`, `false`, or a `where` the document MUST match. */
type Permission = boolean | Record<string, unknown>;

/**
 * Whether the signed-in user MAY `op` a collection, global or field, from the `access` that `/schema` sends. A
 * `where` allows when `doc` matches it, and when there is no document to match. The server stays the authority.
 */
export function can(
  entry: { access?: object } | undefined,
  op: string,
  doc?: Record<string, unknown>,
) {
  const permission = (entry?.access as Record<string, Permission> | undefined)?.[op];
  if (permission === false) return false;
  if (typeof permission !== "object" || !doc) return true;
  return Object.entries(permission).every(([key, value]) =>
    value === null ? doc[key] == null : doc[key] === value,
  );
}

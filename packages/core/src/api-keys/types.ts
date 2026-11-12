// No runtime imports: the client and the admin import this file.

/**
 * An operation a key MAY be granted. A global takes `read` and `update`, `schema` only `read`. `backup` takes `read`
 * (export) and `update` (import, which replaces content, users included).
 */
export type ApiKeyOp = "create" | "read" | "update" | "delete";

/**
 * What a key MAY do, per target: `collection:<name>`, `global:<name>`, `schema` or `backup`. A missing target grants
 * nothing.
 * @example { "collection:posts": ["read", "create"], "global:site": ["read"], schema: ["read"] }
 */
export type ApiKeyPermissions = Record<string, ApiKeyOp[]>;

/** The key of a request, as hooks and access rules get it. */
export type ApiKeyCaller = { id: string; name: string | null; permissions: ApiKeyPermissions };

/** An API key as `GET /api-keys` lists it. The key itself is shown only once, when it is created. */
export type ApiKey = {
  id: string;
  name: string | null;
  /** The first characters of the key, to tell keys apart. */
  start: string | null;
  permissions: ApiKeyPermissions;
  /** `false` once revoked. A revoked key stays listed, so documents it wrote keep a name. */
  enabled: boolean;
  /** The admin who created the key. The key does not act as them. `null` when that user no longer exists. */
  creator: { id: string; name: string; email: string } | null;
  createdAt: string;
  /** `null` for a key that was never used. */
  lastUsedAt: string | null;
  /** `null` for a key that does not expire. */
  expiresAt: string | null;
};

/** A key that was just created, with the secret. */
export type NewApiKey = ApiKey & { key: string };

const ALL: ApiKeyOp[] = ["create", "read", "update", "delete"];

/**
 * Every target a key MAY be granted, with its operations: each collection, each global, `schema` and `backup`.
 * @returns The targets in the order of `collections`, then `globals`, then `schema`, then `backup`.
 */
export function apiKeyTargets(schema: {
  collections: Record<string, unknown>;
  globals: Record<string, unknown>;
}): Record<string, ApiKeyOp[]> {
  return {
    ...Object.fromEntries(Object.keys(schema.collections).map((n) => [`collection:${n}`, ALL])),
    ...Object.fromEntries(
      Object.keys(schema.globals).map((n) => [`global:${n}`, ["read", "update"]]),
    ),
    schema: ["read"],
    backup: ["read", "update"],
  };
}

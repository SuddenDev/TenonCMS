import type { InjectionKey, Ref } from "vue";
import type { ApiKey, ApiKeyOp, ApiKeyPermissions, NewApiKey } from "../../../../core/src/client";
import { apiKeyTargets } from "../../../../core/src/api-keys/types";
import { schema } from "@/shared/api";
import { i18n, text } from "@/shared/i18n";

const { t } = i18n.global;

/** What the API keys list shares with its panes. */
export type ApiKeysContext = {
  keys: Ref<ApiKey[]>;
  loading: Ref<boolean>;
  load(): Promise<void>;
  /** Opens the dialog with the secret of a key that was just created. */
  showKey(key: NewApiKey): void;
};
export const apiKeysKey: InjectionKey<ApiKeysContext> = Symbol("api-keys");

/** The lifetimes a new key can get, in days. `0` never expires. */
export const EXPIRY_DAYS = [0, 30, 90, 365] as const;

/** The columns of the permission grid. */
export const API_KEY_OPS: ApiKeyOp[] = ["read", "create", "update", "delete"];

/** One row of the permission grid: a collection, a global, `schema` or `backup`, with the operations it takes. */
export type GridRow = { target: string; label: string; description?: string; ops: ApiKeyOp[] };

/** Rows of one kind of target, under a headline. */
export type GridGroup = { title: string; rows: GridRow[] };

/** The collections, the globals, and `schema` with `backup`, each a group. Empty groups are left out. */
export function gridGroups(): GridGroup[] {
  const rows = Object.entries(
    apiKeyTargets({
      collections: schema.value.collections ?? {},
      globals: schema.value.globals ?? {},
    }),
  ).map(([target, ops]): GridRow => ({ target, ops, ...targetText(target) }));
  const group = (kinds: string[], title: string) => ({
    title,
    rows: rows.filter((r) => kinds.includes(r.target.split(":")[0])),
  });
  return [
    group(["collection"], t("apiKeys.groups.collections")),
    group(["global"], t("apiKeys.groups.globals")),
    group(["schema", "backup"], t("apiKeys.groups.api")),
  ].filter((g) => g.rows.length);
}

/** The label and description of a grid target in the admin language, from its definition. */
function targetText(target: string): { label: string; description?: string } {
  if (target === "schema")
    return { label: t("apiKeys.schema"), description: t("apiKeys.schemaDescription") };
  if (target === "backup")
    return { label: t("apiKeys.backup"), description: t("apiKeys.backupDescription") };
  const [kind, name] = target.split(":");
  if (kind === "collection" && name === "media")
    return {
      label: text(schema.value.admin?.media?.label) ?? t("nav.media"),
      description: t("apiKeys.mediaDescription"),
    };
  const entry = (kind === "collection" ? schema.value.collections : schema.value.globals)?.[name];
  return { label: text(entry?.label) ?? name, description: text(entry?.description) };
}

/** How many targets a key reaches, in the admin language. */
export const grantsLabel = (permissions: ApiKeyPermissions) =>
  t("apiKeys.targets", Object.keys(permissions).length);

/** The state of a key: `revoked` wins over `expired`. */
export function keyStatus(key: ApiKey): "active" | "revoked" | "expired" {
  if (!key.enabled) return "revoked";
  if (key.expiresAt && Date.parse(key.expiresAt) < Date.now()) return "expired";
  return "active";
}

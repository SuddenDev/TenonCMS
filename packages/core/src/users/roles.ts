import type { Text } from "../admin/index.d.ts";

/** A host role. Its name is the key in `roles`. */
export type RoleOptions = {
  /** Shown in the admin. Defaults to the role name. */
  label?: Text;
  /** Shown under the label where the admin picks a role. */
  description?: Text;
};

/** A role with its name and label. */
export type Role = { name: string; label: Text; description?: Text };

/** `admin` manages users. `editor` edits content. */
export const BUILT_IN_ROLES: Role[] = [
  {
    name: "admin",
    label: { en: "Admin", de: "Admin" },
    description: {
      en: "Edits content and manages users",
      de: "Bearbeitet Inhalte und verwaltet Benutzer",
    },
  },
  {
    name: "editor",
    label: { en: "Editor", de: "Redakteur" },
    description: { en: "Edits content", de: "Bearbeitet Inhalte" },
  },
];

/**
 * The built-in roles, then the host's.
 * @throws for a host role named like a built-in one, or with a name outside `[a-z0-9-]`.
 */
export function normalizeRoles(roles: Record<string, RoleOptions> | undefined): Role[] {
  const own = Object.entries(roles ?? {}).map(([name, { label, description }]) => {
    if (BUILT_IN_ROLES.some((r) => r.name === name))
      throw new Error(`tenoncms: role "${name}" is built in`);
    if (!/^[a-z0-9-]+$/.test(name))
      throw new Error(`tenoncms: role "${name}" MUST match [a-z0-9-]`);
    return { name, label: label ?? name, ...(description !== undefined && { description }) };
  });
  return [...BUILT_IN_ROLES, ...own];
}

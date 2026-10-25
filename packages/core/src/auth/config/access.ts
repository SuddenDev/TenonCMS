import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { Role } from "../../users/roles.ts";

/**
 * The permissions of better-auth's `admin()` plugin for each role. `admin` manages users and sessions, but MUST NOT
 * impersonate. Every other role has no user permissions.
 */
export function userAccess(roles: Role[]) {
  const ac = createAccessControl(defaultStatements);
  const none = ac.newRole({ user: [], session: [] });
  const admin = ac.newRole({
    user: defaultStatements.user.filter((p) => !p.startsWith("impersonate")),
    session: [...defaultStatements.session],
  });
  return {
    ac,
    roles: Object.fromEntries(roles.map((r) => [r.name, r.name === "admin" ? admin : none])),
  };
}

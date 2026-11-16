import type { UserWithRole } from "better-auth/plugins/admin";
import type { Core } from "../../cms/runtime/types.ts";
import type { UserSummary } from "../types.ts";

// `Core` hides better-auth's API from the type checker, so the endpoint of `manageUsers()` is typed here.
type Api = { listAllUsers(): Promise<{ users: UserWithRole[] }> };

/** Every user, oldest first. */
export async function listUsers(core: Core): Promise<UserSummary[]> {
  const { api } = (await core.auth()) as unknown as { api: Api };
  const { users } = await api.listAllUsers();
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role ?? null,
    deactivated: !!u.banned,
    createdAt: new Date(u.createdAt).toISOString(),
  }));
}

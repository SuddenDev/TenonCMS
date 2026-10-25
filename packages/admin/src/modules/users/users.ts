import type { InjectionKey, Ref } from "vue";
import type { Router } from "vue-router";
import type { Invite, InviteResult } from "../../../../core/src/client";
import { CmsError, client, schema } from "@/shared/api";
import { text } from "@/shared/i18n";
import type { AdminUser } from "./status";

/** What the Users list shares with its panes. */
export type UsersContext = {
  users: Ref<AdminUser[]>;
  invites: Ref<Invite[]>;
  loading: Ref<boolean>;
  load(): Promise<void>;
  /** Opens the dialog with an invite link to pass on by hand. `failed`: sending the email did not work. */
  showLink(result: InviteResult, failed: boolean): void;
};
export const usersKey: InjectionKey<UsersContext> = Symbol("users");

/** The absolute URL of an admin page, so links in emails work under a custom admin path. */
export const adminUrl = (router: Router, path: string) =>
  new URL(router.resolve(path).href, location.origin).href;

/** The label of a role in the admin language, else the role name. */
export const roleLabel = (name: string) =>
  text(schema.value.roles?.find((r) => r.name === name)?.label) ?? name;

/**
 * Runs a create or resend call. A 502 means the invite exists but sending failed; its body still holds the link.
 * @returns The result, and whether sending `failed`.
 * @throws Any other error.
 */
export const sendingInvite = async (call: () => Promise<InviteResult>) => {
  try {
    return { result: await call(), failed: false };
  } catch (e) {
    if (!(e instanceof CmsError && e.status === 502)) throw e;
    return { result: e.body as InviteResult, failed: true };
  }
};

// better-auth's `admin()` endpoints. They answer 403 unless the session user is an admin.
const admin = (path: string, body: object) =>
  client.request(`/auth/admin/${path}`, { method: "POST", body });

/** Up to 100 users. Paging comes when a site needs it. */
export const listUsers = async () =>
  (
    await client.request<{ users: AdminUser[] }>("/auth/admin/list-users", {
      query: { limit: 100, sortBy: "createdAt", sortDirection: "asc" },
    })
  ).users;

/** Creates a user with a password the admin hands on. */
export const createUser = async (body: {
  email: string;
  name: string;
  password: string;
  role: string;
}) =>
  (await client.request<{ user: AdminUser }>("/auth/admin/create-user", { method: "POST", body }))
    .user;

/** Changes the role of a user. */
export const setRole = (userId: string, role: string) => admin("set-role", { userId, role });

/** Signs the user out everywhere and blocks sign-in, until reactivated. */
export const deactivate = (userId: string) => admin("ban-user", { userId });

/** Lets a deactivated user sign in again. */
export const reactivate = (userId: string) => admin("unban-user", { userId });

/** Ends every session of the user. */
export const signOutEverywhere = (userId: string) => admin("revoke-user-sessions", { userId });

/** Deletes the user. */
export const removeUser = (userId: string) => admin("remove-user", { userId });

/** Sends the user the reset email, with the admin's reset page as the link. */
export const sendPasswordReset = (email: string, redirectTo: string) =>
  client.requestPasswordReset({ email, redirectTo });

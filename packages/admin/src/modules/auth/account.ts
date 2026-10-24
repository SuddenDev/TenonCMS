import { client } from "@/shared/api";

/** Writes the signed-in user's name and preferences. `null` clears a preference. */
export const updateUser = (data: {
  name?: string;
  language?: string | null;
  timezone?: string | null;
}) => client.request("/auth/update-user", { method: "POST", body: data });

/** Whether the user can sign in with a password. Users of other providers MAY have none. */
export const hasPassword = async () =>
  (await client.request<{ providerId: string }[]>("/auth/list-accounts")).some(
    (a) => a.providerId === "credential",
  );

/** Replaces the password and signs out every other session. */
export const changePassword = (currentPassword: string, newPassword: string) =>
  client.request("/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword, revokeOtherSessions: true },
  });

/** Sets the first password of a user without one. */
export const setPassword = (newPassword: string) =>
  client.request("/account/password", { method: "POST", body: { newPassword } });

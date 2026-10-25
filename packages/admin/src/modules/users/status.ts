import type { Invite } from "../../../../core/src/client";

/** A user as better-auth's `/admin/list-users` returns it. */
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  createdAt: string;
};

/** One row of the Users table: a user or a pending invite. `date` is when the user joined or was invited. */
export type Row = {
  kind: "user" | "invite";
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "deactivated" | "invited" | "expired";
  date: string;
};

/** The users, then the invites. A user without a role counts as `editor`, like on the server. */
export function rows(users: AdminUser[], invites: Invite[]): Row[] {
  return [
    ...users.map((u) => ({
      kind: "user" as const,
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role ?? "editor",
      status: u.banned ? ("deactivated" as const) : ("active" as const),
      date: u.createdAt,
    })),
    ...invites.map((i) => ({
      kind: "invite" as const,
      id: i.id,
      name: "",
      email: i.email,
      role: i.role,
      status: i.expired ? ("expired" as const) : ("invited" as const),
      date: i.createdAt,
    })),
  ];
}

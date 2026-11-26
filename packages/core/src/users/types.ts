// Types only: the client imports them.
import type { Role } from "./roles.ts";

/** A pending invite, as `GET /invites` lists it. The token is never sent. */
export type Invite = {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
};

/** The answer of creating or resending an invite. */
export type InviteResult = {
  invite: Invite;
  /** The invite page with the token. Send it yourself when `sent` is `false`. */
  link: string;
  /** Whether an email went out. `false` without email configuration or when sending failed. */
  sent: boolean;
};

/** The answer of `cms.users.signInLink()`. */
export type SignInLinkResult = {
  /** Signs the user in once, within an hour. Pass it on yourself when `sent` is `false`. */
  link: string;
  /** Whether an email went out. `false` without email configuration or when sending failed. */
  sent: boolean;
  /** Why sending failed. */
  message?: string;
};

/** A user, as `cms.users.list()` returns it. */
export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  /** Whether the user is banned: no sessions, no sign-in. */
  deactivated: boolean;
  createdAt: string;
};

/**
 * `cms.users`: user management for server code and the CLI. It checks no access rules, so a `withSession()` copy
 * refuses it.
 */
export type UsersApi = {
  /** Whether any user exists. Until one does, the first user created becomes an admin. */
  hasUsers(): Promise<boolean>;
  /**
   * Invites `email` with `role`, like `POST /invites`, and emails the invite when email is configured. The invite is
   * stored as from `cli`.
   * @param input.url The invite page, e.g. `https://example.com/admin/invite`. Defaults to `/invite` under
   * `admin.path` on the origin of `auth.baseURL`, else `site.url`.
   * @throws Without `url`, when there is no admin or neither origin is set.
   */
  invite(input: {
    email: string;
    role: string;
    url?: string;
  }): Promise<InviteResult & { message?: string }>;
  /**
   * Creates a user directly. The first user becomes an admin, whatever `role` says. Without `password` the user signs
   * in another way, e.g. with {@link UsersApi.signInLink}. The email counts as verified, so a first magic link keeps
   * the password.
   */
  create(input: {
    email: string;
    name: string;
    role?: string;
    password?: string;
  }): Promise<{ id: string; email: string; name: string; role?: string | null }>;
  /**
   * A link that signs the user in once, within an hour, ends their other sessions and opens the admin's account
   * settings. It is emailed when email is configured.
   * @param origin The site's origin, e.g. `https://example.com`.
   */
  signInLink(email: string, options: { origin: string }): Promise<SignInLinkResult>;
  /** Every user, oldest first. */
  list(): Promise<UserSummary[]>;
  /** The roles a user MAY get: the built-in ones, then the host's. */
  roles(): Role[];
  /**
   * Ends the user's sessions and blocks sign-in until {@link UsersApi.reactivate}, like Deactivate in the admin.
   * @throws `ConflictError` for the last active admin, and an `Error` for an unknown email.
   */
  deactivate(email: string): Promise<void>;
  /** Lets a deactivated user sign in again. @throws An `Error` for an unknown email. */
  reactivate(email: string): Promise<void>;
  /**
   * Deletes the user with their sessions and accounts, like Remove in the admin. Content keeps their id in
   * `createdBy` and `updatedBy`. It cannot be undone.
   * @throws `ConflictError` for the last active admin, and an `Error` for an unknown email.
   */
  remove(email: string): Promise<void>;
};

// Types only: the client imports them.

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

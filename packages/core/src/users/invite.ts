import type { InviteRow } from "../db/types.ts";
import type { Invite } from "./types.ts";

/** How long an invite link works. */
export const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;

/** An invite row as the API sends it. `expired` is compared with `now`. */
export const toInvite = (row: InviteRow, now = Date.now()): Invite => ({
  id: row.id,
  email: row.email,
  role: row.role,
  invitedBy: row.invited_by,
  expiresAt: new Date(row.expires_at).toISOString(),
  createdAt: new Date(row.created_at).toISOString(),
  expired: row.expires_at <= now,
});

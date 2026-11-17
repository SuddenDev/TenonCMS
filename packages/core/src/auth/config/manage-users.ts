import { APIError, createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import type { UserWithRole } from "better-auth/plugins/admin";
import type { Db } from "../../db/types.ts";
import { z } from "zod";
import { otherAdmins } from "../../db/queries/users/other-admins.query.ts";

const byEmail = {
  method: "POST",
  body: z.object({ email: z.string() }),
  metadata: { SERVER_ONLY: true },
} as const;

/**
 * Server-only user management for `cms.users`. better-auth's `admin()` endpoints require an admin's session, which
 * server code does not have. Each endpoint writes what its `admin()` counterpart writes. An unknown email throws 404;
 * deactivating or removing the last active admin throws 409.
 */
export const manageUsers = (db: Db) =>
  ({
    id: "tenon-manage-users",
    endpoints: {
      listAllUsers: createAuthEndpoint(
        "/tenon/list-users",
        { method: "GET", metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          // ponytail: one page of 10,000 users. Page through when a site has more.
          const users = await ctx.context.internalAdapter.listUsers(10_000, 0, {
            field: "createdAt",
            direction: "asc",
          });
          return ctx.json({ users: users as UserWithRole[] });
        },
      ),

      // Like `banUser`: the ban does not expire.
      deactivateUser: createAuthEndpoint("/tenon/deactivate-user", byEmail, async (ctx) => {
        const user = await requireUser(ctx, ctx.body.email);
        await requireOtherAdmin(db, user);

        await ctx.context.internalAdapter.updateUser(user.id, {
          banned: true,
          banReason: "No reason",
          banExpires: null,
          updatedAt: new Date(),
        });
        await ctx.context.internalAdapter.deleteUserSessions(user.id);
        return ctx.json({ success: true });
      }),

      // Like `unbanUser`.
      reactivateUser: createAuthEndpoint("/tenon/reactivate-user", byEmail, async (ctx) => {
        const user = await requireUser(ctx, ctx.body.email);
        await ctx.context.internalAdapter.updateUser(user.id, {
          banned: false,
          banReason: null,
          banExpires: null,
          updatedAt: new Date(),
        });
        return ctx.json({ success: true });
      }),

      // Like `removeUser`. References in content stay.
      removeUserByEmail: createAuthEndpoint("/tenon/remove-user", byEmail, async (ctx) => {
        const user = await requireUser(ctx, ctx.body.email);
        await requireOtherAdmin(db, user);

        await ctx.context.internalAdapter.deleteUserSessions(user.id);
        await ctx.context.internalAdapter.deleteUser(user.id);
        return ctx.json({ success: true });
      }),
    },
  }) satisfies BetterAuthPlugin;

async function requireUser(ctx: GenericEndpointContext, email: string) {
  const found = await ctx.context.internalAdapter.findUserByEmail(email);
  if (!found) throw new APIError("NOT_FOUND", { message: `No user has the email ${email}` });
  return found.user as UserWithRole;
}

// Over HTTP, better-auth refuses self-ban and self-removal, so the caller stays an admin. Server calls have no caller.
async function requireOtherAdmin(db: Db, user: UserWithRole) {
  if (user.role !== "admin" || user.banned) return;
  if (!(await otherAdmins(db, user.id)))
    throw new APIError("CONFLICT", { message: "At least one admin is required" });
}

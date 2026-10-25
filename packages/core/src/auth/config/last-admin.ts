import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import type { Kysely } from "kysely";
import type { Database } from "../../db/types.ts";
import { otherAdmins } from "../../db/queries/users/other-admins.query.ts";

/**
 * Refuses a role change that leaves no active admin. Only `set-role` can do that over HTTP: the caller is an active
 * admin, and better-auth refuses self-ban and self-removal.
 */
export const lastAdmin = (db: Kysely<Database>) =>
  ({
    id: "integral-last-admin",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/admin/set-role",
          handler: createAuthMiddleware(async (ctx) => {
            const { userId, role } = ctx.body as { userId: string; role: string | string[] };
            if ([role].flat().includes("admin")) return;
            if (!(await otherAdmins(db, userId)))
              throw new APIError("CONFLICT", { message: "At least one admin is required" });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

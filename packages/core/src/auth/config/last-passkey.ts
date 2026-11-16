import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { signInMethods } from "./sign-in-methods.ts";

/**
 * Refuses to delete a user's last passkey while it is their only way to sign in: password is off and no magic link or
 * email OTP can send.
 */
export const lastPasskey = () =>
  ({
    id: "tenon-last-passkey",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/passkey/delete-passkey",
          handler: createAuthMiddleware(async (ctx) => {
            const { password, magicLink, emailOtp } = signInMethods(ctx.context.options);
            if (password || magicLink || emailOtp) return;
            const session = await getSessionFromCtx(ctx);
            if (!session) return;

            const { id } = ctx.body as { id: string };
            const others = await ctx.context.adapter.count({
              model: "passkey",
              where: [
                { field: "userId", value: session.user.id },
                { field: "id", operator: "ne", value: id },
              ],
            });
            if (!others)
              throw new APIError("BAD_REQUEST", {
                message:
                  "Add another passkey before you remove this one. It is your only way to sign in.",
              });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

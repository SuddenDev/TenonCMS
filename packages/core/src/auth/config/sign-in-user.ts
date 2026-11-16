import { APIError, createAuthEndpoint, originCheck } from "better-auth/api";
import type { BetterAuthPlugin, GenericEndpointContext, User } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { hashToken, newToken } from "../../users/token.ts";

/** How long a sign-in link works. */
export const SIGN_IN_LINK_TTL = 60 * 60 * 1000;

const identifier = async (token: string) => `tenon-sign-in:${await hashToken(token)}`;

/**
 * Signs a user in without a password, for server code and recovery links. `signInUser` and `createSignInLink` are
 * server-only. `GET /sign-in-link?token=` is public: it ends the user's other sessions, signs them in and redirects. A used,
 * expired or unknown token redirects to the login with `?error=INVALID_TOKEN`.
 */
export const signInUser = () =>
  ({
    id: "tenon-sign-in-user",
    endpoints: {
      signInUser: createAuthEndpoint(
        "/tenon/sign-in-user",
        {
          method: "POST",
          body: z.object({ userId: z.string() }),
          metadata: { SERVER_ONLY: true },
        },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
          if (!user) throw new APIError("NOT_FOUND", { message: "User not found" });
          await startSession(ctx, user);
          return ctx.json({ user });
        },
      ),

      createSignInLink: createAuthEndpoint(
        "/tenon/create-sign-in-link",
        {
          method: "POST",
          body: z.object({ email: z.string() }),
          metadata: { SERVER_ONLY: true },
        },
        async (ctx) => {
          const found = await ctx.context.internalAdapter.findUserByEmail(ctx.body.email);
          if (!found) throw new APIError("NOT_FOUND", { message: "No user has this email" });
          const token = newToken();
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: await identifier(token),
            value: found.user.id,
            expiresAt: new Date(Date.now() + SIGN_IN_LINK_TTL),
          });
          return ctx.json({ token, user: found.user });
        },
      ),

      signInLink: createAuthEndpoint(
        "/sign-in-link",
        {
          method: "GET",
          query: z.object({
            token: z.string(),
            callbackURL: z.string().optional(),
            errorCallbackURL: z.string().optional(),
          }),
          use: [
            originCheck((ctx) => ctx.query?.callbackURL ?? "/"),
            originCheck((ctx) => ctx.query?.errorCallbackURL ?? "/"),
          ],
        },
        async (ctx) => {
          // Consuming deletes the value, so a link works once. An expired value reads as missing.
          const value = await ctx.context.internalAdapter.consumeVerificationValue(
            await identifier(ctx.query.token),
          );
          const user = value && (await ctx.context.internalAdapter.findUserById(value.value));
          // ponytail: assumes the admin at `/admin`, like `deviceAuthorization()`.
          if (!user) {
            // The same error as better-auth's magic link, so the admin login shows one message for both.
            const url = new URL(ctx.query.errorCallbackURL ?? "/admin/login", ctx.context.baseURL);
            url.searchParams.set("error", "INVALID_TOKEN");
            throw ctx.redirect(url.href);
          }

          await ctx.context.internalAdapter.deleteUserSessions(user.id);
          await startSession(ctx, user);
          throw ctx.redirect(ctx.query.callbackURL ?? "/admin/?settings=security");
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

async function startSession(ctx: GenericEndpointContext, user: User) {
  const session = await ctx.context.internalAdapter.createSession(user.id);
  if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "No session was created" });
  await setSessionCookie(ctx, { session, user });
}

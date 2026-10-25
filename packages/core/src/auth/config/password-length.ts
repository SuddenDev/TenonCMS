import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";

/**
 * The problem with a password's length, else `undefined`. better-auth checks the length on sign-up, but not when an
 * admin or server code creates a user. Its defaults are 8 and 128.
 */
export function lengthProblem(password: string, { emailAndPassword }: BetterAuthOptions) {
  const min = emailAndPassword?.minPasswordLength ?? 8;
  const max = emailAndPassword?.maxPasswordLength ?? 128;
  if (password.length < min) return `MUST be at least ${min} characters`;
  if (password.length > max) return `MUST be at most ${max} characters`;
}

/** Applies the sign-up length rules to `/admin/create-user`. */
export const passwordLength = () =>
  ({
    id: "integral-password-length",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/admin/create-user",
          handler: createAuthMiddleware(async (ctx) => {
            const { password } = ctx.body as { password?: string };
            const problem = password && lengthProblem(password, ctx.context.options);
            if (problem) throw new APIError("BAD_REQUEST", { message: `Password ${problem}` });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

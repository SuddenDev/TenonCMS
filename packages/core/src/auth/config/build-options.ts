import { APIError, type BetterAuthOptions } from "better-auth";
import { type Kysely, sql } from "kysely";
import { API_BASE } from "../../client/index.ts";
import type { Database } from "../../db/types.ts";
import type { AuthOptions } from "./options.ts";
import type { EmailApi, EmailTemplates, EmailTemplateData } from "../../email/types.ts";
import { emailTemplates } from "../../email/templates.ts";

type UserCreate = NonNullable<
  NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>["create"]
>;
type BeforeCreate = Parameters<NonNullable<UserCreate["before"]>>;

export function authOptions<A extends AuthOptions>(
  db: Kysely<Database>,
  secret: string,
  host: A,
  email?: { api: EmailApi; templates?: Partial<EmailTemplates> },
) {
  const { emailAndPassword, emailVerification, ...options } = host;
  const create = host.databaseHooks?.user?.create;
  const send =
    email &&
    ((key: keyof EmailTemplates) => async (data: EmailTemplateData) => {
      const content = await (email.templates?.[key] ?? emailTemplates[key])(data);
      await email.api.send({ ...content, to: data.user.email });
    });
  return {
    ...options,
    basePath: `${API_BASE}/auth`,
    secret,
    database: { db, type: "sqlite" as const },
    // The admin login needs email and password, so core MUST force it on.
    emailAndPassword: {
      ...emailAndPassword,
      enabled: true,
      ...(send && {
        sendResetPassword: emailAndPassword?.sendResetPassword ?? send("resetPassword"),
      }),
    },
    emailVerification: send
      ? {
          ...emailVerification,
          sendVerificationEmail: emailVerification?.sendVerificationEmail ?? send("verifyEmail"),
        }
      : emailVerification,
    databaseHooks: {
      ...host.databaseHooks,
      user: {
        ...host.databaseHooks?.user,
        create: {
          ...create,
          // Core MUST run first, so a host hook cannot reopen public sign-up.
          async before(user: BeforeCreate[0], ctx: BeforeCreate[1]) {
            await firstUserOnly(db, ctx);
            return create?.before?.(user, ctx);
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

// Once a user exists, only a request with a session MAY create users, whatever the endpoint.
// Server code without a request is trusted, as in better-auth's admin plugin.
async function firstUserOnly(db: Kysely<Database>, ctx: BeforeCreate[1]) {
  if (!ctx?.request && !ctx?.headers) return;
  if (ctx.context.session) return;
  const { rows } = await sql<{ n: number }>`SELECT count(*) AS n FROM "user"`.execute(db);
  if (rows[0].n > 0) throw new APIError("FORBIDDEN", { message: "Sign-up is closed" });
}

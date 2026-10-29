import { APIError, type BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import type { Kysely } from "kysely";
import { API_BASE } from "../../client/index.ts";
import { isPostgres } from "../../db/queries/document-sql.ts";
import type { Database } from "../../db/types.ts";
import type { AuthOptions } from "./options.ts";
import type { EmailApi, EmailTemplates, EmailTemplateData } from "../../email/types.ts";
import { emailTemplates } from "../../email/templates.ts";
import { signUpStatus } from "../sign-up.ts";
import { BUILT_IN_ROLES, type Role } from "../../users/roles.ts";
import { userAccess } from "./access.ts";
import { apiKeyRoutesOff, apiKeys } from "./api-keys.ts";
import { lastAdmin } from "./last-admin.ts";
import { passwordLength } from "./password-length.ts";
import { userFields } from "./user-fields.ts";

/** What core adds to the host's better-auth options. */
export type CoreAuth = {
  email?: { api: EmailApi; templates?: Partial<EmailTemplates> };
  /** better-auth's `appName` when the host sets none. Passkeys show it as the relying party's name. */
  appName?: string;
  /** Defaults to the built-in roles. */
  roles?: Role[];
};

type UserCreate = NonNullable<
  NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>["create"]
>;
type BeforeCreate = Parameters<NonNullable<UserCreate["before"]>>;

export function authOptions<A extends AuthOptions>(
  db: Kysely<Database>,
  secret: string,
  host: A,
  { email, appName = "integral-cms", roles = BUILT_IN_ROLES }: CoreAuth = {},
) {
  const { emailAndPassword, emailVerification, plugins = [], rateLimit, user, ...options } = host;
  const has = (id: string) => plugins.some((p) => p.id === id);
  const create = host.databaseHooks?.user?.create;
  const send =
    email &&
    ((key: "resetPassword" | "verifyEmail") => async (data: EmailTemplateData) => {
      const content = await (email.templates?.[key] ?? emailTemplates[key])(data);
      await email.api.send({ ...content, to: data.user.email });
    });
  return {
    appName,
    ...options,
    // Serverless instances do not share memory, so better-auth's default storage does not limit them.
    rateLimit: { storage: "database" as const, ...rateLimit },
    basePath: `${API_BASE}/auth`,
    secret,
    database: { db, type: isPostgres(db) ? ("postgres" as const) : ("sqlite" as const) },
    user: { ...user, additionalFields: { ...userFields, ...user?.additionalFields } },
    // The admin manages users with `admin()`. API keys come from `apiKey()`. A host's plugin with the same id replaces
    // core's. Typed as the host's plugins: their endpoint types break the declaration build (TS7056).
    plugins: [
      ...plugins,
      ...(has("admin")
        ? []
        : [admin({ ...userAccess(roles), adminRoles: ["admin"], defaultRole: "editor" })]),
      ...(has("api-key") ? [] : [apiKeys()]),
      apiKeyRoutesOff(),
      lastAdmin(db),
      passwordLength(),
    ] as A["plugins"],
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
          // Core MUST run first, so a host hook cannot reopen sign-up.
          async before(user: BeforeCreate[0], ctx: BeforeCreate[1]) {
            const first = await checkCreate(db, ctx);
            const data = first ? { ...user, role: "admin" } : user;
            const result = await create?.before?.(data, ctx);
            return result ?? (first ? { data } : undefined);
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

// The first user becomes an admin. After that, a request MAY create a user only with an admin's session, whatever
// the endpoint. Server code without a request is trusted, as in better-auth's admin plugin.
// Returns whether the new user is the first.
async function checkCreate(db: Kysely<Database>, ctx: BeforeCreate[1]) {
  const { setup } = await signUpStatus(db);
  if (setup) return true;
  if (!ctx?.request && !ctx?.headers) return false;
  const session = ctx.context.session as { user: { role?: string | null } } | null;
  if (!session) throw new APIError("FORBIDDEN", { message: "Sign-up is closed" });
  if (session.user.role !== "admin")
    throw new APIError("FORBIDDEN", { message: "Only admins can create users" });
  return false;
}

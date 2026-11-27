import { APIError, type BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { bearer } from "better-auth/plugins/bearer";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { isPostgres } from "../../db/create-db.ts";
import type { Db } from "../../db/types.ts";
import { API_BASE } from "../../client/index.ts";
import { DEVICE_CLIENT_ID } from "../../client/constants.ts";
import type { AuthOptions } from "./options.ts";
import type { EmailApi, EmailTemplates, EmailTemplateData } from "../../email/types.ts";
import { emailTemplates } from "../../email/templates.ts";
import { signUpStatus } from "../sign-up.ts";
import { BUILT_IN_ROLES, type Role } from "../../users/roles.ts";
import { userAccess } from "./access.ts";
import { apiKeyRoutesOff, apiKeys } from "./api-keys.ts";
import { withEmailSender } from "./email-sign-in.ts";
import { lastAdmin } from "./last-admin.ts";
import { lastPasskey } from "./last-passkey.ts";
import { lastSignInMethod } from "./last-sign-in-method.ts";
import { manageUsers } from "./manage-users.ts";
import { passwordLength } from "./password-length.ts";
import { signInUser } from "./sign-in-user.ts";
import { userFields } from "./user-fields.ts";

/** What core adds to the host's better-auth options. */
export type CoreAuth = {
  email?: { api: EmailApi; templates?: Partial<EmailTemplates> };
  /** better-auth's `appName` when the host sets none. Passkeys show it as the relying party's name. */
  appName?: string;
  /** better-auth's `baseURL` when the host sets none: the `site.url` origin. */
  siteUrl?: string;
  /** The admin's path. Links into the admin point under it. Without it, core adds no device login. */
  adminPath?: string;
  /** Defaults to the built-in roles. */
  roles?: Role[];
};

type UserCreate = NonNullable<
  NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>["create"]
>;
type BeforeCreate = Parameters<NonNullable<UserCreate["before"]>>;

export function authOptions<A extends AuthOptions>(
  db: Db,
  secret: string,
  host: A,
  { email, appName = "tenoncms", siteUrl, adminPath, roles = BUILT_IN_ROLES }: CoreAuth = {},
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
    baseURL: options.baseURL ?? siteUrl,
    // Serverless instances do not share memory, so better-auth's default storage does not limit them.
    rateLimit: { storage: "database" as const, ...rateLimit },
    basePath: `${API_BASE}/auth`,
    secret,
    database: { db, type: isPostgres(db) ? ("postgres" as const) : ("sqlite" as const) },
    user: { ...user, additionalFields: { ...userFields, ...user?.additionalFields } },
    // The admin manages users with `admin()`. API keys come from `apiKey()`. A host's plugin with the same id replaces
    // core's. Typed as the host's plugins: their endpoint types break the declaration build (TS7056).
    plugins: [
      ...(email ? plugins.map((p) => withEmailSender(p, email)) : plugins),
      ...(has("admin")
        ? []
        : [admin({ ...userAccess(roles), adminRoles: ["admin"], defaultRole: "editor" })]),
      ...(has("api-key") ? [] : [apiKeys()]),
      // `tenon login`: the CLI shows a code, a signed-in user approves it in the admin, the CLI gets a session token
      // and sends it as `Authorization: Bearer`.
      ...(has("device-authorization") || !adminPath
        ? []
        : [
            deviceAuthorization({
              verificationUri: `${adminPath}/device`,
              validateClient: (id) => id === DEVICE_CLIENT_ID,
            }),
          ]),
      ...(has("bearer") ? [] : [bearer()]),
      ...(has("last-login-method") ? [] : [lastSignInMethod()]),
      apiKeyRoutesOff(),
      lastAdmin(db),
      lastPasskey(),
      passwordLength(),
      signInUser(adminPath),
      manageUsers(db),
    ] as A["plugins"],
    emailAndPassword: {
      ...emailAndPassword,
      enabled: emailAndPassword?.enabled ?? true,
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
          // Core MUST run first, so a host hook cannot reopen sign-up. better-auth merges the returned data onto
          // `user`, so the first user's result MUST carry the admin role.
          // The first user owns the site, so their email counts as verified. better-auth deletes the password and
          // the sessions of an unverified user on their first magic link.
          async before(user: BeforeCreate[0], ctx: BeforeCreate[1]) {
            const first = await checkCreate(db, ctx);
            const data = first ? { ...user, role: "admin", emailVerified: true } : user;
            const result = await create?.before?.(data, ctx);
            if (!first || result === false) return result;
            const changes = typeof result === "object" ? result.data : undefined;
            return { data: { ...data, ...changes, role: "admin" } };
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

// The first user becomes an admin. After that, a request MAY create a user only with an admin's session, whatever
// the endpoint. Server code without a request is trusted, as in better-auth's admin plugin.
// Returns whether the new user is the first.
async function checkCreate(db: Db, ctx: BeforeCreate[1]) {
  const { setup } = await signUpStatus(db);
  if (setup) return true;
  if (!ctx?.request && !ctx?.headers) return false;
  const session = ctx.context.session as { user: { role?: string | null } } | null;
  if (!session) throw new APIError("FORBIDDEN", { message: "Sign-up is closed" });
  if (session.user.role !== "admin")
    throw new APIError("FORBIDDEN", { message: "Only admins can create users" });
  return false;
}

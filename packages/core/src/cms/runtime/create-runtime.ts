import type { User } from "better-auth";
import { authOptions, type CoreAuth } from "../../auth/config/build-options.ts";
import type { AuthOptions } from "../../auth/config/options.ts";
import { apiKeyCaller } from "../../auth/api-key-caller.ts";
import { createAuth } from "../../auth/create-auth.ts";
import { developmentRequestOrigin } from "../../auth/config/base-url.ts";
import { createDb, type DatabaseOptions } from "../../db/create-db.ts";
import { migrate } from "../../db/migrations/migrate.ts";
import { syncLocalized } from "../../db/migrations/sync-localized.ts";
import type { Fields } from "../../schema/index.ts";

type Session = {
  getSession(context: { headers: Headers }): Promise<{ user: User } | null>;
};

/**
 * Create the database and auth of the CMS. Both are lazy and nothing connects at import time.
 * @param database The libsql url and token, or a Kysely dialect
 * @param secret The secret of better-auth, checked by `defineCms()`
 * @param host The host's better-auth options
 * @param localized The localized keys of every `collection:<name>` / `global:<name>` (`null` when not localized) and the
 * default locale, with the fields of each entry. After the migrations, the stored state is synced to them.
 * @param coreAuth Email delivery, the default app name and the roles.
 * @returns `db()` connects and migrates on its first call. `auth()` creates better-auth on its first call.
 * `getSession()` reads the session of a request's headers. `getApiKey()` verifies an API key.
 */
export function createRuntime<A extends AuthOptions>(
  database: DatabaseOptions,
  secret: string,
  host: A,
  localized: {
    current: Record<string, string[] | null>;
    defaultLocale: string;
    fields: Record<string, Fields>;
  },
  coreAuth?: CoreAuth,
) {
  // The same promise serves every call, so the database opens and migrates once. A failed attempt is dropped, so the
  // next call tries again.
  let connection:
    | Promise<{ db: ReturnType<typeof createDb>; options: ReturnType<typeof authOptions<A>> }>
    | undefined;
  const connect = () =>
    (connection ??= (async () => {
      const db = createDb(database);
      const options = authOptions(db, secret, host, coreAuth);
      await migrate(db, options);
      await syncLocalized(db, localized.current, localized.defaultLocale, localized.fields);
      return { db, options };
    })().catch((error: unknown) => {
      connection = undefined;
      throw error;
    }));

  const db = async () => (await connect()).db;

  let authInstance: ReturnType<typeof createAuth<ReturnType<typeof authOptions<A>>>> | undefined;
  let requestOrigin: string | undefined;
  const bindRequest = (request: Request) => {
    if (requestOrigin) return;
    const origin = developmentRequestOrigin(request);
    if (!origin) return;
    requestOrigin = origin;
    const baseURL = authInstance?.options.baseURL;
    if (!host.baseURL && typeof baseURL === "object") baseURL.fallback ??= origin;
  };
  const auth = async () => (authInstance ??= createAuth((await connect()).options, requestOrigin));

  // `A` hides `getSession` from the type checker, so it is typed here.
  const getSession = async (headers: Headers) =>
    ((await auth()).api as unknown as Session).getSession({ headers });

  const getApiKey = async (key: string) => apiKeyCaller(await auth(), key);

  return { db, auth, getSession, getApiKey, bindRequest };
}

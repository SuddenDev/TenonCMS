import type { User } from "better-auth";
import { authOptions, type CoreAuth } from "../../auth/config/build-options.ts";
import type { AuthOptions } from "../../auth/config/options.ts";
import { createAuth } from "../../auth/create-auth.ts";
import { createDb } from "../../db/create-db.ts";
import { migrate } from "../../db/migrations/migrate.ts";
import { syncLocalized } from "../../db/migrations/sync-localized.ts";

type Session = {
  getSession(context: { headers: Headers }): Promise<{ user: User } | null>;
};

/**
 * Create the database and auth of the CMS. Both are lazy and nothing connects at import time.
 * @param database The database url and token
 * @param secret The secret of better-auth, checked when auth is first used
 * @param host The host's better-auth options
 * @param localized The localized keys of every `collection:<name>` / `global:<name>` (`null` when not localized) and the
 * default locale. After the migrations, the stored state is synced to them.
 * @param coreAuth Email delivery, the passkeys' relying party and the roles.
 * @returns `db()` connects and migrates on its first call. `auth()` creates better-auth on its first call.
 * `getSession()` reads the session of a request's headers.
 */
export function createRuntime<A extends AuthOptions>(
  database: { url: string; authToken?: string },
  secret: string,
  host: A,
  localized: { current: Record<string, string[] | null>; defaultLocale: string },
  coreAuth?: CoreAuth,
) {
  // The same promise serves every call, so the database opens and migrates once.
  let connection:
    | Promise<{ db: ReturnType<typeof createDb>; options: ReturnType<typeof authOptions<A>> }>
    | undefined;
  const connect = () =>
    (connection ??= (async () => {
      const db = createDb(database.url, database.authToken);
      const options = authOptions(db, secret, host, coreAuth);
      await migrate(db, options);
      await syncLocalized(db, localized.current, localized.defaultLocale);
      return { db, options };
    })());

  const db = async () => (await connect()).db;

  let authInstance: ReturnType<typeof createAuth<ReturnType<typeof authOptions<A>>>> | undefined;
  const auth = async () => {
    if (!secret || secret.length < 32)
      throw new Error("integral-cms: `secret` MUST be at least 32 characters");
    return (authInstance ??= createAuth((await connect()).options));
  };

  // `A` hides `getSession` from the type checker, so it is typed here.
  const getSession = async (headers: Headers) =>
    ((await auth()).api as unknown as Session).getSession({ headers });

  return { db, auth, getSession };
}

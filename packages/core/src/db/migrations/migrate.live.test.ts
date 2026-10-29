import pg from "pg";
import { expect, it } from "vitest";
import { createDb } from "../create-db.ts";
import { postgres } from "../../integrations/postgres/index.ts";
import { migrate } from "./migrate.ts";

// Runs only against a real Postgres server, where connections run in parallel. The URL's user MUST be allowed to
// create databases: POSTGRES_TEST_URL=postgres://user@localhost:5432/postgres npx vitest run migrate.live
const url = process.env.POSTGRES_TEST_URL;

it.skipIf(!url || process.env.CMS_TEST_DB)(
  "migrates one fresh database from several instances at once",
  { timeout: 60_000 },
  async () => {
    const name = `cms_race_${crypto.randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client(url);
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    const target = new URL(url!);
    target.pathname = `/${name}`;
    const databases = Array.from({ length: 4 }, () => postgres(target.href));

    try {
      const results = await Promise.allSettled(
        databases.map((database) => {
          const db = createDb(database);
          return migrate(db, { database: { db, type: "postgres" } });
        }),
      );
      expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    } finally {
      await Promise.all(databases.map((d) => d.pool.end()));
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
    }
  },
);

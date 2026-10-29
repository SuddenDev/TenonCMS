import { CompiledQuery } from "kysely";
import { expect, it } from "vitest";
import { onPglite, testDatabase } from "../../../tests/setup.ts";
import { createDb } from "../../create-db.ts";
import { migrate } from "../../migrations/migrate.ts";
import { insertDoc } from "../documents/insert-document.query.ts";
import { mediaByKey, mediaKeyQuery } from "./media-by-key.query.ts";

it("keeps media keys unique and finds them through the index", async () => {
  const db = createDb(testDatabase());
  await migrate(db, { database: { db, type: onPglite ? "postgres" : "sqlite" } });
  const file = { key: "a/x.png", filename: "x.png" };
  const doc = await insertDoc(db, "media", file, null);
  await expect(insertDoc(db, "media", file, null)).rejects.toThrow(/unique/i);
  await insertDoc(db, "posts", file, null);
  expect(await mediaByKey(db, "a/x.png")).toEqual(doc);
  expect(await mediaByKey(db, "a/y.png")).toBeUndefined();
  const query = mediaKeyQuery(db, "a/x.png").compile();
  // Postgres scans a table this small; turning scans off shows whether the index fits the query.
  if (onPglite) await db.executeQuery(CompiledQuery.raw("SET enable_seqscan = off"));
  const plan = await db.executeQuery<Record<string, string>>(
    CompiledQuery.raw(`EXPLAIN${onPglite ? "" : " QUERY PLAN"} ${query.sql}`, [
      ...query.parameters,
    ]),
  );
  expect(JSON.stringify(plan.rows)).toContain("cms_media_key_idx");
});

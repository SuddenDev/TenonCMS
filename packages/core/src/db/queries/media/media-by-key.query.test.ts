import { CompiledQuery } from "kysely";
import { expect, it } from "vitest";
import { createDb } from "../../create-db.ts";
import { migrate } from "../../migrations/migrate.ts";
import { insertDoc } from "../documents/insert-document.query.ts";
import { mediaByKey, mediaKeyQuery } from "./media-by-key.query.ts";

it("keeps media keys unique and finds them through the index", async () => {
  const db = createDb({ url: ":memory:" });
  await migrate(db, { database: { db, type: "sqlite" } });
  const file = { key: "a/x.png", filename: "x.png" };
  const doc = await insertDoc(db, "media", file, null);
  await expect(insertDoc(db, "media", file, null)).rejects.toThrow(/UNIQUE/);
  await insertDoc(db, "posts", file, null);
  expect(await mediaByKey(db, "a/x.png")).toEqual(doc);
  expect(await mediaByKey(db, "a/y.png")).toBeUndefined();
  const query = mediaKeyQuery(db, "a/x.png").compile();
  const plan = await db.executeQuery<{ detail: string }>(
    CompiledQuery.raw(`EXPLAIN QUERY PLAN ${query.sql}`, [...query.parameters]),
  );
  expect(plan.rows.map((r) => r.detail).join()).toContain("cms_media_key_idx");
});

import { expect, it } from "vitest";
import type { Fields } from "@/shared/api";
import { pageRows } from "./page-rows";

const entries: Record<string, { fields: Fields; visualEditing?: boolean }> = {
  "posts:": {
    fields: {
      author: { type: "relation", collection: "authors" },
      seo: { type: "group", fields: { pick: { type: "relation", collection: "comments" } } },
      hero: { type: "relation", collection: "media" },
    },
  },
  "authors:": { fields: { name: { type: "text" } } },
  "comments:": {
    visualEditing: false,
    fields: { post: { type: "relation", collection: "posts" } },
  },
  "footer:global": { visualEditing: false, fields: {} },
  "general:global": { fields: {} },
};
const entryOf = (d: { collection: string; id: string }) =>
  entries[`${d.collection}:${d.id ? "" : "global"}`];

it("lists the page's documents, then what they point to, each once, without excluded entries", () => {
  const data: Record<string, Record<string, unknown>> = {
    "posts:1": { author: "a", seo: { pick: "c" }, hero: "m" },
    "comments:9": { post: "2" },
  };
  const rows = pageRows(
    [
      { collection: "posts", id: "1" },
      { collection: "comments", id: "9" },
      { collection: "footer", id: "" },
      { collection: "general", id: "" },
      { collection: "posts", id: "1" },
      { collection: "unknown", id: "x" },
    ],
    entryOf,
    (key) => data[key],
  );

  expect(rows.map((r) => [r.key, r.depth])).toEqual([
    ["posts:1", 0],
    ["authors:a", 1],
    ["general:", 0],
  ]);
});

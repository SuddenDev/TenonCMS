import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors.ts";
import { localized } from "./setup.ts";

const HOUR = 3_600_000;
const NOTHING = { "": "Nothing to publish" };
const SCHEDULED = { "": "A publish is scheduled. Cancel it first." };

// `posts` is localized, `authors` is not.
const make = () =>
  localized({
    collections: {
      posts: { schedule: true },
      authors: { schedule: true, fields: { name: { type: "text" } } },
    },
  }).cms;
type Cms = ReturnType<typeof make>;

const errors = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => (e instanceof ValidationError ? e.errors : e),
  );

const plan = (
  cms: Cms,
  collection: "posts" | "authors",
  id: string,
  options: { action?: "publish" | "unpublish"; locale?: string } = {},
) =>
  cms.schedule(collection, id, {
    action: "publish",
    at: Date.now() + HOUR,
    ...options,
  } as never);

/** A post published in en and de, with a draft in both and a scheduled publish of de. */
async function scheduledPost() {
  const cms = make();
  const post = await cms.create("posts", { title: "Hello" });
  await cms.update("posts", post.id, { title: "Hallo" }, { locale: "de" } as never);
  await cms.update("posts", post.id, { title: "Hi" }, { draft: true });
  await cms.update("posts", post.id, { title: "Hallo 2" }, {
    locale: "de",
    draft: true,
  } as never);
  await plan(cms, "posts", post.id, { locale: "de" });
  return { cms, id: post.id };
}

describe("a scheduled publish needs a draft", () => {
  it("rejects a document without one, but not an unpublish", async () => {
    const cms = make();
    const author = await cms.create("authors", { name: "Live" });

    expect(await errors(plan(cms, "authors", author.id))).toEqual(NOTHING);
    expect(await plan(cms, "authors", author.id, { action: "unpublish" })).toHaveProperty("id");
  });

  it("rejects a locale without one", async () => {
    const cms = make();
    const post = await cms.create("posts", { title: "Hello" }, { draft: true });

    expect(await errors(plan(cms, "posts", post.id, { locale: "de" }))).toEqual(NOTHING);
    expect(await plan(cms, "posts", post.id, { locale: "en" })).toHaveProperty("id");
  });
});

describe("a scheduled publish locks its draft", () => {
  it("blocks draft saves of the document, but not a new document", async () => {
    const cms = make();
    const author = await cms.create("authors", { name: "Soon" }, { draft: true });
    await plan(cms, "authors", author.id);

    expect(
      await errors(cms.update("authors", author.id, { name: "Later" }, { draft: true })),
    ).toEqual(SCHEDULED);
    expect(await cms.create("authors", { name: "Other" }, { draft: true })).toHaveProperty("id");
  });

  it("blocks draft saves, discard and locale removal of that locale only", async () => {
    const { cms, id } = await scheduledPost();

    expect(
      await errors(
        cms.update("posts", id, { title: "Hallo 3" }, { locale: "de", draft: true } as never),
      ),
    ).toEqual(SCHEDULED);
    expect(await cms.update("posts", id, { title: "Hi 2" }, { draft: true })).toMatchObject({
      title: "Hi 2",
    });

    expect(await errors(cms.discard("posts", id, { locale: "de" } as never))).toEqual(SCHEDULED);
    expect(await errors(cms.discard("posts", id, { all: true } as never))).toEqual(SCHEDULED);
    expect(await errors(cms.removeLocale("posts", id, "de" as never))).toEqual(SCHEDULED);
    expect(await cms.discard("posts", id, { locale: "en" } as never)).toMatchObject({
      title: "Hello",
    });
  });
});

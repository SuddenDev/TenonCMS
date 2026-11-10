import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "../index.ts";
import { admin, fresh, localized, status, type Env } from "./setup.ts";

// Tokens have millisecond precision, so two writes MUST NOT share a millisecond.
const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

let cms: Env["cms"];
let client: Env["client"];
beforeEach(async () => {
  ({ cms, client } = fresh());
  await client.signUp(admin);
});

describe("edit conflicts", () => {
  it("refuse an update with a stale updatedAt, accept the current one or none", async () => {
    const loaded = await client.create("posts", { title: "One" });
    await tick();
    await client.update("posts", loaded.id, { title: "Two" });

    expect(
      await status(
        client.update("posts", loaded.id, { title: "Three" }, { updatedAt: loaded.updatedAt }),
      ),
    ).toBe(409);
    expect(await client.findById("posts", loaded.id)).toMatchObject({ title: "Two" });
    await expect(
      client.update("posts", loaded.id, { title: "Three" }, { updatedAt: loaded.updatedAt }),
    ).rejects.toMatchObject({ body: { code: "CHANGED" } });

    const current = await client.findById("posts", loaded.id);
    await tick();
    const saved = await client.update(
      "posts",
      loaded.id,
      { title: "Four" },
      { updatedAt: current.updatedAt },
    );
    expect(saved).toMatchObject({ title: "Four" });
    expect(await client.update("posts", loaded.id, { title: "Five" })).toMatchObject({
      title: "Five",
    });
  });

  it("refuse a stale draft save and publish", async () => {
    const loaded = await client.createDraft("posts", { title: "One" });
    await tick();
    await client.updateDraft("posts", loaded.id, { title: "Two" });

    const stale = { updatedAt: loaded.updatedAt };
    expect(await status(client.updateDraft("posts", loaded.id, { title: "Three" }, stale))).toBe(
      409,
    );
    expect(await status(client.publish("posts", loaded.id, stale))).toBe(409);
  });

  it("refuse a stale global write", async () => {
    const loaded = await client.setGlobal("site", { name: "One" });
    expect(loaded.updatedAt).toEqual(expect.any(String));
    expect((await client.getGlobal("site")).updatedAt).toBe(loaded.updatedAt);
    await tick();
    await client.setGlobal("site", { name: "Two" });

    const stale = { updatedAt: loaded.updatedAt };
    expect(await status(client.setGlobal("site", { name: "Three" }, stale))).toBe(409);
    expect(await status(client.setGlobalDraft("site", { name: "Three" }, stale))).toBe(409);
    expect(await status(client.publishGlobal("site", stale))).toBe(409);
  });

  it("throw ConflictError in the local API", async () => {
    const loaded = await cms.create("posts", { title: "One" });
    await tick();
    await cms.update("posts", loaded.id, { title: "Two" });

    await expect(
      cms.update("posts", loaded.id, { title: "Three" }, { updatedAt: loaded.updatedAt }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("edit conflicts in a localized collection", () => {
  it("ignore a save in another locale, unless it changes shared fields", async () => {
    const { client } = localized();
    await client.signUp(admin);
    await client.preview.enter();
    const created = await client.create("posts", { title: "Hi", views: 1 });
    await tick();
    await client.updateDraft("posts", created.id, { title: "Hallo" }, { locale: "de" });
    const en = await client.findById("posts", created.id, { locale: "en", fallback: false });
    await tick();

    await client.updateDraft("posts", created.id, { title: "Moin" }, { locale: "de" });
    expect(
      await client.updateDraft(
        "posts",
        created.id,
        { title: "Hello" },
        { locale: "en", updatedAt: en.updatedAt },
      ),
    ).toMatchObject({ title: "Hello" });

    const de = await client.findById("posts", created.id, { locale: "de", fallback: false });
    await tick();
    await client.updateDraft("posts", created.id, { views: 2 }, { locale: "en" });
    expect(
      await status(
        client.updateDraft(
          "posts",
          created.id,
          { title: "Servus" },
          { locale: "de", updatedAt: de.updatedAt },
        ),
      ),
    ).toBe(409);
  });

  it("refuse a stale save in the same locale", async () => {
    const { client } = localized();
    await client.signUp(admin);
    await client.preview.enter();
    const created = await client.create("posts", { title: "Hi" });
    await tick();
    await client.updateDraft("posts", created.id, { title: "Hallo" }, { locale: "de" });
    const de = await client.findById("posts", created.id, { locale: "de", fallback: false });
    await tick();
    await client.updateDraft("posts", created.id, { title: "Moin" }, { locale: "de" });

    expect(
      await status(
        client.updateDraft(
          "posts",
          created.id,
          { title: "Servus" },
          { locale: "de", updatedAt: de.updatedAt },
        ),
      ),
    ).toBe(409);
  });
});

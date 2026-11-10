import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCK_TTL } from "../client/constants.ts";
import { defineCms } from "../index.ts";
import { base, fresh, setup, status, withAdmin } from "./setup.ts";

const editor = { name: "Ed", email: "e@b.co", password: "password123" };

/** An admin and a signed-in editor on one instance. Nobody MAY update `pages`. */
async function twoEditors() {
  const cms = defineCms({
    ...base,
    collections: {
      ...base.collections,
      pages: { fields: { title: { type: "text" } }, access: { update: () => false } },
    },
  });
  const a = await withAdmin(cms);
  await a.create(editor);
  const b = setup(cms);
  await b.client.signIn(editor);
  const post = await a.client.create("posts", { title: "Hi" });
  return { a: a.client, b: b.client, admin: a.me, id: post.id };
}

afterEach(() => vi.useRealTimers());

describe("edit locks", () => {
  it("go to the first editor, tell others who holds them, and can be taken over", async () => {
    const { a, b, admin, id } = await twoEditors();

    expect(await a.lock("posts", id)).toEqual({
      mine: true,
      user: { id: admin.id, name: "Admin" },
    });
    expect(await a.lock("posts", id)).toMatchObject({ mine: true });
    expect(await b.lock("posts", id)).toEqual({
      mine: false,
      user: { id: admin.id, name: "Admin" },
    });
    await b.unlock("posts", id);
    expect(await b.lock("posts", id)).toMatchObject({ mine: false });

    expect(await b.lock("posts", id, { takeover: true })).toMatchObject({
      mine: true,
      user: { name: "Ed" },
    });
    expect(await a.lock("posts", id)).toMatchObject({ mine: false, user: { name: "Ed" } });
  });

  it("free up on unlock and on expiry, also on globals", async () => {
    const { a, b, id } = await twoEditors();
    await a.lock("posts", id);
    await a.unlock("posts", id);
    expect(await b.lock("posts", id)).toMatchObject({ mine: true });

    expect(await a.lockGlobal("site")).toMatchObject({ mine: true });
    expect(await b.lockGlobal("site")).toMatchObject({ mine: false, user: { name: "Admin" } });
    await a.unlockGlobal("site");
    expect(await b.lockGlobal("site")).toMatchObject({ mine: true });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + LOCK_TTL + 1);
    expect(await a.lock("posts", id)).toMatchObject({ mine: true });
  });

  it("need a session and the right to update", async () => {
    const { b, id } = await twoEditors();
    expect(await status(fresh().client.lock("posts", id))).toBe(401);
    expect(await status(b.lock("pages", "x"))).toBe(403);
    expect(await status(b.lock("nope" as never, "x"))).toBe(404);
  });
});

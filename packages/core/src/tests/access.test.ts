import { describe, expect, it } from "vitest";
import { defineCms, type AccessArgs } from "../index.ts";
import { ForbiddenError } from "../errors.ts";
import { png } from "./fixtures.ts";
import { admin, base, localized, origin, setup, status, withAdmin, withMedia } from "./setup.ts";

const editor = { name: "Ed", email: "e@b.co", password: "password123" };
const author = { name: "Au", email: "au@b.co", password: "password123", role: "author" };

const schema = {
  ...base,
  roles: { author: {} },
  collections: {
    people: {
      fields: {
        name: { type: "text" },
        notes: { type: "text", access: { read: ["admin"] } },
        posts: { type: "join", collection: "posts", on: "person" },
      },
      access: { read: ({ user }: AccessArgs) => (user ? true : { name: "Public" }) },
    },
    posts: {
      fields: {
        title: { type: "text", required: true },
        secret: { type: "text", access: { read: ["admin"] } },
        locked: { type: "text", access: { update: ["admin"], create: ["admin"] } },
        person: { type: "relation", collection: "people" },
        links: {
          type: "array",
          fields: {
            url: { type: "text" },
            note: { type: "text", access: { update: false } },
            hidden: { type: "text", access: { read: ["admin"] } },
          },
        },
      },
      access: {
        create: ["admin", "editor", "author"],
        update: ({ user }: AccessArgs) => (user?.role === "author" ? { createdBy: user.id } : true),
        delete: ["admin", "editor"],
      },
    },
    feedback: {
      fields: { message: { type: "text" } },
      access: { create: true, read: ["admin"] },
    },
  },
  globals: {
    site: { fields: { name: { type: "text" } }, access: { update: ["admin"] } },
  },
} as const;

/** An instance with an admin, an editor, an author and an anonymous client, each with its own cookie jar. */
async function users() {
  const env = await withAdmin(defineCms(schema));
  await env.create(editor);
  const au = await env.create(author);
  const sign = async (user?: { email: string; password: string }) => {
    const s = setup(env.cms);
    if (user) await s.client.signIn(user);
    return s;
  };
  return {
    cms: env.cms,
    me: env.me,
    authorId: au.id,
    admin: env.client,
    editor: (await sign(editor)).client,
    author: (await sign(author)).client,
    anon: (await sign()).client,
    anonFetch: (await sign()).fetch,
  };
}

describe("collection rules", () => {
  it("allow the roles of a list and deny others", async () => {
    const u = await users();
    const p = await u.admin.create("posts", { title: "A" });
    expect(await status(u.author.delete("posts", p.id))).toBe(403);
    await u.editor.delete("posts", p.id);
    expect(await u.cms.findById("posts", p.id)).toBeUndefined();
  });

  it("deny anonymous writes by default with 401 and allow them with `create: true`", async () => {
    const u = await users();
    expect(await status(u.anon.create("posts", { title: "A" }))).toBe(401);
    const f = await u.anon.create("feedback", { message: "Hi" });
    expect(f.message).toBe("Hi");
    expect(await status(u.anon.find("feedback"))).toBe(401);
    expect(await status(u.editor.find("feedback"))).toBe(403);
    expect(await u.admin.find("feedback")).toHaveLength(1);
  });

  it("filter reads with a `where`", async () => {
    const u = await users();
    const pub = await u.cms.create("people", { name: "Public" });
    const hidden = await u.cms.create("people", { name: "Hidden" });
    expect((await u.anon.find("people")).map((p) => p.id)).toEqual([pub.id]);
    // A user filter cannot widen the rule's.
    expect(await u.anon.find("people", { where: { name: "Hidden" } })).toEqual([]);
    expect(await status(u.anon.findById("people", hidden.id))).toBe(404);
    expect(await u.editor.find("people")).toHaveLength(2);
  });

  it("limit an author to their own documents", async () => {
    const u = await users();
    const own = await u.author.create("posts", { title: "Mine" });
    const other = await u.admin.create("posts", { title: "Theirs" });
    expect(own.createdBy).toBe(u.authorId);
    expect(other.createdBy).toBe(u.me.id);

    expect((await u.author.update("posts", own.id, { title: "Mine 2" })).title).toBe("Mine 2");
    expect(await status(u.author.update("posts", other.id, { title: "x" }))).toBe(403);
    expect((await u.editor.update("posts", other.id, { title: "Ed" })).updatedBy).not.toBe(u.me.id);

    const mine = await u.author.find("posts", { where: { createdBy: u.authorId } });
    expect((mine as { id: string }[]).map((p) => p.id)).toEqual([own.id]);
  });

  it("apply to publish, discard and drafts", async () => {
    const u = await users();
    const other = await u.admin.create("posts", { title: "Theirs" });
    expect(await status(u.author.updateDraft("posts", other.id, { title: "x" }))).toBe(403);
    await u.admin.updateDraft("posts", other.id, { title: "Draft" });
    expect(await status(u.author.publish("posts", other.id))).toBe(403);
    expect(await status(u.author.discard("posts", other.id))).toBe(403);
    // An author MAY discard their own never-published draft, which deletes it, without `delete`.
    const own = await u.author.createDraft("posts", { title: "Mine" });
    await u.author.discard("posts", own.id);
    expect(await u.cms.withDrafts().findById("posts", own.id)).toBeUndefined();
  });

  it("are skipped by the server `cms` and by the `cms` of hooks, and enforced by `withSession()`", async () => {
    const seen: unknown[] = [];
    const cms = defineCms({
      ...base,
      collections: {
        posts: {
          fields: { title: { type: "text" } },
          access: { read: false, create: false },
          hooks: {
            afterChange: [async ({ cms }) => void seen.push((await cms.find("posts")).length)],
          },
        },
      },
    });
    await cms.create("posts", { title: "A" });
    expect(seen).toEqual([1]);
    expect(await cms.find("posts")).toHaveLength(1);
    const visitor = await cms.withSession(new Request(origin));
    await expect(visitor.find("posts")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(visitor.create("posts", { title: "B" })).rejects.toMatchObject({ status: 401 });
  });
});

describe("population", () => {
  it("drops related documents outside the target's rule", async () => {
    const u = await users();
    const pub = await u.cms.create("people", { name: "Public" });
    const hidden = await u.cms.create("people", { name: "Hidden" });
    const a = await u.cms.create("posts", { title: "A", person: pub.id });
    const b = await u.cms.create("posts", { title: "B", person: hidden.id });
    expect((await u.anon.findById("posts", a.id)).person).toMatchObject({ id: pub.id });
    expect((await u.anon.findById("posts", b.id)).person).toBeNull();
    expect((await u.editor.findById("posts", b.id)).person).toMatchObject({ id: hidden.id });

    const people = await u.anon.find("people", { populate: { posts: true } });
    expect(people[0].posts.map((p: { id: string }) => p.id)).toEqual([a.id]);
  });
});

describe("field rules", () => {
  it("remove read-denied fields, also from populated documents and write results", async () => {
    const u = await users();
    const person = await u.cms.create("people", { name: "Public", notes: "n" });
    const p = await u.cms.create("posts", { title: "A", secret: "s", person: person.id });
    const read = await u.editor.findById("posts", p.id);
    expect(read).not.toHaveProperty("secret");
    expect(read.person).not.toHaveProperty("notes");
    expect(await u.admin.findById("posts", p.id)).toMatchObject({ secret: "s" });
    expect(await u.editor.update("posts", p.id, { title: "B" })).not.toHaveProperty("secret");
  });

  it("remove a read-denied join", async () => {
    const posts = {
      type: "join",
      collection: "posts",
      on: "person",
      access: { read: ["admin"] },
    } as const;
    const cms = defineCms({
      ...base,
      collections: {
        people: { fields: { name: { type: "text" }, posts } },
        posts: { fields: { person: { type: "relation", collection: "people" } } },
      },
    } as const);
    const person = await cms.create("people", { name: "P" });
    await cms.create("posts", { person: person.id });
    const visitor = await cms.withSession(new Request(origin));
    const populate = { posts: true } as const;
    expect(await visitor.findById("people", person.id, { populate })).not.toHaveProperty("posts");
    expect((await cms.findById("people", person.id, { populate }))!.posts).toHaveLength(1);
  });

  it("keep a read-denied value inside an item that a write sends without it", async () => {
    const u = await users();
    const p = await u.cms.create("posts", {
      title: "A",
      links: [{ id: "1", url: "u", hidden: "h" }],
    });
    await u.editor.update("posts", p.id, { links: [{ id: "1", url: "v" }] });
    expect((await u.cms.findById("posts", p.id))!.links).toEqual([
      { id: "1", url: "v", hidden: "h" },
    ]);
  });

  it("reject a filter on a read-denied field", async () => {
    const u = await users();
    expect(await status(u.editor.find("posts", { where: { secret: "s" } }))).toBe(400);
    expect((await u.anonFetch(`${origin}/api/cms/collections/posts?secret=s`)).status).toBe(400);
  });

  it("keep the stored value of an update-denied field", async () => {
    const u = await users();
    const p = await u.admin.create("posts", {
      title: "A",
      locked: "l",
      links: [{ id: "1", url: "u", note: "n" }],
    });
    const changed = await u.editor.update("posts", p.id, {
      locked: "x",
      links: [
        { id: "1", url: "v", note: "x" },
        { id: "2", url: "w", note: "y" },
      ],
    });
    expect(changed.locked).toBe("l");
    expect(changed.links).toEqual([
      { id: "1", url: "v", note: "n" },
      { id: "2", url: "w" },
    ]);
    expect((await u.editor.create("posts", { title: "B", locked: "x" })).locked).toBeUndefined();
  });

  it("keep `private` as signed-in only", async () => {
    const cms = defineCms({
      ...base,
      collections: {
        posts: { fields: { title: { type: "text" }, email: { type: "text", private: true } } },
      },
    });
    const p = await cms.create("posts", { title: "A", email: "e" });
    const env = setup(cms);
    expect(await env.client.findById("posts", p.id)).not.toHaveProperty("email");
    await env.client.signUp(admin);
    expect(await env.client.findById("posts", p.id)).toMatchObject({ email: "e" });
  });
});

describe("ownership", () => {
  it("records who created and changed a document, and hides it from anonymous readers", async () => {
    const u = await users();
    const p = await u.admin.create("posts", { title: "A" });
    expect(p).toMatchObject({ createdBy: u.me.id, updatedBy: u.me.id });
    expect(await u.anon.findById("posts", p.id)).not.toHaveProperty("createdBy");
    expect(await status(u.anon.find("posts", { where: { createdBy: u.me.id } }))).toBe(400);
    const server = await u.cms.update("posts", p.id, { title: "B" });
    expect(server).toMatchObject({ createdBy: u.me.id, updatedBy: null });
  });
});

describe("globals", () => {
  it("check `read` and `update`", async () => {
    const u = await users();
    expect(await status(u.editor.setGlobal("site", { name: "x" }))).toBe(403);
    expect(await status(u.editor.setGlobalDraft("site", { name: "x" }))).toBe(403);
    await u.admin.setGlobal("site", { name: "S" });
    expect((await u.anon.getGlobal("site")).name).toBe("S");
  });
});

describe("media", () => {
  it("check `media.access` before an upload starts", async () => {
    const env = withMedia({ access: { create: ["admin"] } }, { roles: { author: {} } });
    expect(
      await status(env.client.media.upload(new File([png], "a.png", { type: "image/png" }))),
    ).toBe(401);
    await env.client.signUp(admin);
    const doc = await env.client.media.upload(new File([png], "a.png", { type: "image/png" }));
    expect(doc.createdBy).toEqual(expect.any(String));
  });
});

describe("startup", () => {
  it("throws for an unknown role and for write rules on a join", () => {
    const posts = (access: object) => ({
      ...base,
      collections: { posts: { fields: { title: { type: "text" } }, access } },
    });
    expect(() => defineCms(posts({ read: ["nobody"] }) as never)).toThrow('role "nobody"');
    expect(() =>
      defineCms({
        ...base,
        collections: {
          posts: { fields: { title: { type: "text" } } },
          people: {
            fields: {
              posts: { type: "join", collection: "posts", on: "title", access: { update: false } },
            },
          },
        },
      } as never),
    ).toThrow("join");
  });
});

describe("media reads", () => {
  it("guard files, downloads and archives with `media.access.read`", async () => {
    const env = withMedia({ access: { read: ({ user }) => !!user } });
    await env.client.signUp(admin);
    const doc = await env.client.media.upload(new File([png], "a.png", { type: "image/png" }));
    expect((await env.fetchWithSession("/media/files/a.png")).status).toBe(200);
    await env.client.signOut();
    expect((await env.fetchWithSession("/media/files/a.png")).status).toBe(401);
    expect((await env.fetchWithSession(`/media/download?id=${doc.id}`)).status).toBe(401);
    expect((await env.fetchWithSession("/media/download?folder=x")).status).toBe(401);
    expect((await env.fetchWithSession("/media/folders")).status).toBe(401);
  });

  it("list only the folders of files that a `where` lets the caller read", async () => {
    const env = withMedia({ access: { read: ({ user }) => (user ? true : { folder: "pub/a" }) } });
    const upload = (folder: string) =>
      env.cms.media.upload(png, { folder, filename: "a.png", mimeType: "image/png" });
    await upload("pub/a");
    await upload("priv");
    expect(await env.client.media.folders()).toEqual(["pub", "pub/a"]);
    await env.client.signUp(admin);
    expect(await env.client.media.folders()).toEqual(["priv", "pub", "pub/a"]);
  });
});

describe("/schema", () => {
  it("sends the caller's permissions", async () => {
    const u = await users();
    const schema = (await u.editor.getSchema()) as any;
    const { posts, feedback } = schema.collections;
    expect(posts.access).toEqual({ read: true, create: true, update: true, delete: true });
    expect(feedback.access).toEqual({ read: false, create: true, update: true, delete: true });
    expect(posts.fields.secret.access).toEqual({ read: false });
    expect(posts.fields.locked.access).toEqual({ create: false, update: false });
    expect(posts.fields.links.fields.note.access).toEqual({ update: false });
    expect(posts.fields.title).not.toHaveProperty("access");
    expect(schema.globals.site.access).toEqual({ read: true, update: false });
    expect(((await u.admin.getSchema()) as any).globals.site.access.update).toBe(true);

    const authors = (await u.author.getSchema()) as any;
    expect(authors.collections.posts.access).toMatchObject({
      update: { createdBy: u.authorId },
      delete: false,
    });
  });

  it("asks `read` in the perspective of the preview cookie", async () => {
    const env = await withAdmin(
      defineCms({
        ...base,
        collections: {
          posts: {
            fields: { title: { type: "text" } },
            access: { read: ({ user, draft }) => !draft || user?.role === "admin" },
          },
        },
      }),
    );
    await env.create(editor);
    const { client } = setup(env.cms);
    await client.signIn(editor);
    const read = async () => ((await client.getSchema()) as any).collections.posts.access.read;

    expect(await read()).toBe(true);
    await client.preview.enter("drafts");
    expect(await read()).toBe(false);
  });
});

describe("localized documents", () => {
  it("check `update` on copy and remove of a locale", async () => {
    const env = localized({ collections: { posts: { access: { update: ["admin"] } } } });
    const cms = env.cms as any;
    const p = await cms.create("posts", { title: "A" });
    await cms.copyLocale("posts", p.id, { from: "en", to: "de" });
    const { client } = setup(cms) as any;
    expect(await status(client.copyLocale("posts", p.id, { from: "en", to: "de" }))).toBe(401);
    expect(await status(client.removeLocale("posts", p.id, "de"))).toBe(401);
    await client.signUp(admin);
    expect((await client.removeLocale("posts", p.id, "de")).locales).toEqual(["en"]);
  });
});

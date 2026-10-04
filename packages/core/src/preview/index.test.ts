// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { edit, merge, preview, type Unsubscribe } from "./index.ts";

describe("edit", () => {
  it("joins collection, id and path", () => {
    expect(edit("pages", "abc", "seo.title")).toBe("pages:abc:seo.title");
  });

  it("leaves the id empty for a global", () => {
    expect(edit("general", null, "title")).toBe("general::title");
  });
});

describe("merge", () => {
  const doc = { id: "1", title: "Old", body: "B", author: { id: "a1", name: "Ann" } };

  it("replaces top-level keys with the draft of the document", () => {
    expect(merge("posts", doc, { "posts:1": { title: "New" } })).toEqual({ ...doc, title: "New" });
  });

  it("returns the document without a draft", () => {
    expect(merge("posts", doc, { "posts:2": { title: "New" } })).toBe(doc);
    expect(merge("pages", doc, { "posts:1": { title: "New" } })).toBe(doc);
  });

  it("keeps a populated value whose ids did not change", () => {
    const tags = [{ id: "t1" }, { id: "t2" }];
    const merged = merge(
      "posts",
      { ...doc, tags },
      { "posts:1": { author: "a1", tags: ["t1", "t2"] } },
    );
    expect(merged.author).toBe(doc.author);
    expect(merged.tags).toBe(tags);
  });

  it("takes ids that differ", () => {
    const tags = [{ id: "t1" }, { id: "t2" }];
    const merged = merge("posts", { ...doc, tags }, { "posts:1": { author: "a2", tags: ["t2"] } });
    expect(merged.author).toBe("a2");
    expect(merged.tags).toEqual(["t2"]);
  });

  it("keys globals by name and an empty id", () => {
    expect(merge("general", { title: "A" }, { "general:": { title: "B" } })).toEqual({
      title: "B",
    });
  });

  it("passes non-objects through", () => {
    expect(merge("posts", null, { "posts:": { title: "x" } })).toBeNull();
  });
});

describe("preview", () => {
  let stop: Unsubscribe = () => {};
  const bar = () => document.querySelector("[data-cms-bar]");
  const button = (text: string) =>
    [...bar()!.querySelectorAll("button")].find((b) => b.textContent === text)!;
  const cookie = (value: string) => {
    document.cookie = `integral-preview=${value}; path=/`;
  };
  const session = (body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body))),
    );

  beforeEach(() => {
    window.name = "";
    document.cookie = "integral-preview=; max-age=0; path=/";
    document.body.innerHTML = "";
    vi.spyOn(location, "reload").mockImplementation(() => {});
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows no bar in the admin's iframe", () => {
    window.name = "integral-preview";
    stop = preview();
    expect(bar()).toBeNull();
  });

  it("shows the preview bar in a preview tab and removes it on stop", () => {
    window.name = "integral-preview-1";
    stop = preview();
    expect(bar()).not.toBeNull();
    expect(document.documentElement.style.marginTop).toBe("32px");
    stop();
    expect(bar()).toBeNull();
    expect(document.documentElement.style.marginTop).toBe("");
  });

  it("toggles edit mode from the preview bar", () => {
    window.name = "integral-preview-1";
    stop = preview();
    const input = bar()!.querySelector("input")!;
    input.click();
    expect(document.documentElement.hasAttribute("data-cms-edit")).toBe(true);
    input.click();
    expect(document.documentElement.hasAttribute("data-cms-edit")).toBe(false);
  });

  it("leaves the preview tab on exit", () => {
    window.name = "integral-preview-1";
    stop = preview();
    button("Exit preview").click();
    expect(window.name).toBe("");
    expect(location.reload).toHaveBeenCalled();
  });

  it("switches the perspective and reloads", async () => {
    window.name = "integral-preview-1";
    cookie("drafts");
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", post);
    stop = preview();
    expect(button("Drafts").getAttribute("aria-pressed")).toBe("true");
    expect(button("Published").getAttribute("aria-pressed")).toBe("false");
    button("Published").click();
    await vi.waitFor(() => expect(location.reload).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/cms/preview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ perspective: "published" }),
    });
  });

  it("does nothing on a site page without the preview cookie", () => {
    session({ user: {} });
    stop = preview();
    expect(fetch).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
  });

  it("shows no admin bar without a session", async () => {
    cookie("drafts");
    session(null);
    stop = preview();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r));
    expect(fetch).toHaveBeenCalledWith("/api/cms/auth/get-session", { credentials: "same-origin" });
    expect(bar()).toBeNull();
  });

  it("shows no admin bar with admin: false", () => {
    cookie("drafts");
    session({ user: {} });
    stop = preview({ admin: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows no admin bar on the admin's own pages", () => {
    cookie("drafts");
    session({ user: {} });
    history.pushState(null, "", "/cms/collections/pages");
    stop = preview({ admin: "/cms" });
    history.pushState(null, "", "/");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the admin bar with edit links for a session", async () => {
    cookie("published");
    session({ user: {} });
    document.body.innerHTML = `
      <h1 data-cms="pages:p1:title"></h1>
      <p data-cms="pages:p1:body"></p>
      <p data-cms="posts:x:title"></p>
      <footer data-cms="footer::text"></footer>`;
    stop = preview({ admin: "/cms" });
    await vi.waitFor(() => expect(bar()).not.toBeNull());
    const links = [...bar()!.querySelectorAll("a")].map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Admin", "/cms"],
      ["Edit pages", "/cms/presentation/collections/pages/p1"],
      ["Edit posts", "/cms/presentation/collections/posts/x"],
      ["Edit footer", "/cms/presentation/globals/footer"],
    ]);
    expect(button("Published").getAttribute("aria-pressed")).toBe("true");
  });
});

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preview, type Unsubscribe } from "../index.ts";

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

  it("talks only to the admin's origin in the window that opened it, after its first message", () => {
    window.name = "integral-preview-posts:1";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    document.body.innerHTML = `<h1 data-cms="posts:1:title">Old</h1>`;
    stop = preview({ admin: "https://admin.test/admin" });
    expect(opener.postMessage).toHaveBeenCalledWith({ type: "ready" }, "*");
    const draft = { type: "draft", collection: "posts", id: "1", data: { title: "New" } };
    window.dispatchEvent(
      new MessageEvent("message", { data: draft, origin: "https://admin.test" }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: draft,
        origin: "https://evil.test",
        source: opener as never,
      }),
    );
    expect(document.querySelector("h1")!.textContent).toBe("Old");
    expect(opener.postMessage).toHaveBeenCalledTimes(1);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: draft,
        origin: "https://admin.test",
        source: opener as never,
      }),
    );
    expect(document.querySelector("h1")!.textContent).toBe("New");
    expect(opener.postMessage).toHaveBeenCalledWith(
      { type: "url", href: location.href },
      "https://admin.test",
    );
  });

  it("reports the documents on the page in page order, and again when they change", async () => {
    window.name = "integral-preview";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    document.body.innerHTML = `
      <h1 data-cms="pages:p1:title">A</h1>
      <p data-cms="posts:2:title">B</p>
      <p data-cms="pages:p1:body">C</p>
      <footer data-cms="footer::copyright">D</footer>`;
    stop = preview();
    const hello = { data: { type: "mode", edit: true }, origin: location.origin, source: opener };
    window.dispatchEvent(new MessageEvent("message", hello as never));
    expect(opener.postMessage).toHaveBeenCalledWith(
      {
        type: "documents",
        documents: [
          { collection: "pages", id: "p1" },
          { collection: "posts", id: "2" },
          { collection: "footer", id: "" },
        ],
      },
      location.origin,
    );
    opener.postMessage.mockClear();
    document.body.insertAdjacentHTML("beforeend", `<p data-cms="posts:3:title">E</p>`);
    await new Promise((r) => setTimeout(r));
    expect(opener.postMessage).toHaveBeenCalledTimes(1);
    expect(opener.postMessage.mock.calls[0]![0].documents).toHaveLength(4);
  });

  it("highlights the elements of a document the admin points at", () => {
    window.name = "integral-preview";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    document.body.innerHTML = `<h1 data-cms="posts:1:title">A</h1><p data-cms="posts:12:title">B</p>`;
    stop = preview();
    const send = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent("message", { data, origin: location.origin, source: opener as never }),
      );
    const lit = () => [...document.querySelectorAll("[data-cms-highlight]")].map((e) => e.tagName);
    send({ type: "highlight", collection: "posts", id: "1" });
    expect(lit()).toEqual(["H1"]);
    send({ type: "highlight", collection: null, id: null });
    expect(lit()).toEqual([]);
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

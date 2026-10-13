// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminBarContext } from "../../admin/index.d.ts";
import { preview, type Unsubscribe } from "../index.ts";
import { builtIns } from "./admin-bar-items.ts";

const handle = { update: vi.fn<(ctx: AdminBarContext) => void>(), unmount: vi.fn() };
const mountAdminBar = vi.fn((_el: ShadowRoot, _ctx: AdminBarContext) => handle);
vi.mock("integral-cms/admin/bar", () => ({ mountAdminBar }));

describe("preview", () => {
  let stop: Unsubscribe = () => {};
  const cookie = (value: string) => {
    document.cookie = `integral-preview=${value}; path=/`;
  };
  const hint = () => {
    document.cookie = "integral-session=1; path=/";
  };
  const serve = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );
  // Preview controls are fixed. Site items include a configured link.
  const serveModes = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const mode = new URL(url, location.origin).searchParams.get("mode") as
          | "site"
          | "preview-tab";
        const items = builtIns(mode);
        if (mode === "site") items.push({ id: "purge", label: "Purge", href: "/purge" });
        return new Response(JSON.stringify({ position: "bottom-center", items, branding: {} }));
      }),
    );
  const mounted = async () => {
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    return mountAdminBar.mock.calls[0]![1];
  };

  beforeEach(() => {
    window.name = "";
    document.cookie = "integral-preview=; max-age=0; path=/";
    document.cookie = "integral-session=; max-age=0; path=/";
    document.body.innerHTML = "";
    serve(200, { position: "bottom-center", items: builtIns("site") });
    vi.spyOn(location, "reload").mockImplementation(() => {});
  });
  afterEach(() => {
    stop();
    history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mountAdminBar.mockClear();
    handle.update.mockClear();
    handle.unmount.mockClear();
  });

  it("talks only to the admin's origin in the window that opened it, after its first message", async () => {
    window.name = "integral-preview-posts:1";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    document.body.innerHTML = `<h1 data-cms="posts:1:title">Old</h1>`;
    stop = preview({ admin: "https://admin.test/admin" });
    await vi.dynamicImportSettled();
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

  it("stores the locale of a draft with its data", async () => {
    window.name = "integral-preview-posts:9";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    stop = preview({ admin: "https://admin.test/admin" });
    await vi.dynamicImportSettled();
    const message = (locale?: string) =>
      new MessageEvent("message", {
        data: { type: "draft", collection: "posts", id: "9", data: { title: "N" }, locale },
        origin: "https://admin.test",
        source: opener as never,
      });
    window.dispatchEvent(message());
    window.dispatchEvent(message("de"));
    const { getDrafts } = await import("./store.ts");
    expect(getDrafts()["posts:9"]).toEqual({ title: "N", locale: "de" });
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
    await vi.dynamicImportSettled();
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

  it("highlights the elements of a document the admin points at", async () => {
    window.name = "integral-preview";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    document.body.innerHTML = `<h1 data-cms="posts:1:title">A</h1><p data-cms="posts:12:title">B</p>`;
    stop = preview();
    await vi.dynamicImportSettled();
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

  it("shows no admin bar in the admin's iframe", () => {
    window.name = "integral-preview";
    hint();
    stop = preview();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks for no admin bar without the session hint", () => {
    cookie("drafts");
    stop = preview();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks for no admin bar with admin: false", () => {
    hint();
    stop = preview({ admin: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks for no admin bar on the admin's own pages", () => {
    hint();
    history.pushState(null, "", "/cms/collections/pages");
    stop = preview({ admin: "/cms" });
    history.pushState(null, "", "/");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves preview when a preview tab returns to the visual editor", () => {
    window.name = "integral-preview-posts:back";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    history.replaceState(null, "", "/cms/presentation?url=%2Fposts%2Fcurrent");
    stop = preview({ admin: "/cms" });
    expect(window.name).toBe("");
    expect(fetch).not.toHaveBeenCalled();
    expect(opener.postMessage).not.toHaveBeenCalled();
  });

  it("mounts the admin bar with the filled items for the session hint", async () => {
    hint();
    cookie("drafts");
    history.replaceState(null, "", "/posts/current?lang=de&view=draft#details");
    document.body.innerHTML = `<h1 data-cms="pages:p1:title"></h1><p data-cms="pages:p1:body"></p>`;
    stop = preview({ admin: "/cms" });
    const ctx = await mounted();
    expect(fetch).toHaveBeenCalledWith(
      `/api/cms/admin-bar?url=${encodeURIComponent("/posts/current?lang=de&view=draft")}&mode=site`,
      { credentials: "same-origin" },
    );
    expect(document.documentElement.lastElementChild!.hasAttribute("data-cms-bar")).toBe(true);
    expect(mountAdminBar.mock.calls[0]![0]).toBeInstanceOf(ShadowRoot);
    expect(ctx).toMatchObject({
      position: "bottom-center",
      mode: "site",
      perspective: "drafts",
      edit: false,
    });
    expect(ctx.items).toEqual([
      { id: "dashboard", order: 10, label: "Dashboard", builtIn: true, href: "/cms" },
      {
        id: "edit",
        order: 20,
        label: "Edit",
        icon: "pencil",
        builtIn: true,
        href: `/cms/presentation?url=${encodeURIComponent(location.href)}`,
      },
      { id: "perspective", order: 30, label: "Drafts", builtIn: true },
    ]);
  });

  it("keeps the Edit link on the current route after client navigation", async () => {
    hint();
    stop = preview({ admin: "/cms" });
    await mounted();
    history.pushState(null, "", "/posts/next?lang=en#title");
    document.body.innerHTML = `<h1 data-cms="posts:next:title">Next</h1>`;
    await vi.waitFor(() =>
      expect(handle.update.mock.lastCall![0].items.find((item) => item.id === "edit")?.href).toBe(
        `/cms/presentation?url=${encodeURIComponent(location.href)}`,
      ),
    );
    history.replaceState(null, "", "/posts/next?lang=de#title");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(handle.update.mock.lastCall![0].items.find((item) => item.id === "edit")?.href).toBe(
      `/cms/presentation?url=${encodeURIComponent(location.href)}`,
    );
  });

  it("keeps a normal site page outside the live preview channel", async () => {
    hint();
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    document.body.innerHTML = `<h1 data-cms="posts:1:title">Original</h1><input value="Keep">`;
    const original = document.querySelector("input");
    stop = preview();
    const ctx = await mounted();
    for (const data of [
      { type: "mode", edit: true },
      { type: "draft", collection: "posts", id: "1", data: { title: "Draft" } },
    ])
      window.dispatchEvent(
        new MessageEvent("message", { data, source: opener as never, origin: location.origin }),
      );
    expect(document.querySelector("h1")!.textContent).toBe("Original");
    expect(document.querySelector("input")).toBe(original);
    expect(document.documentElement.hasAttribute("data-cms-edit")).toBe(false);
    expect(document.querySelector("iframe")).toBeNull();
    expect(opener.postMessage).not.toHaveBeenCalled();
    ctx.dismiss();
    expect((document.querySelector("[data-cms-bar]") as HTMLElement).hidden).toBe(true);
  });

  it("removes the bar after session expiry", async () => {
    hint();
    stop = preview();
    await mounted();
    serve(401, {});
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(document.querySelector("[data-cms-bar]")).toBeNull());
    expect(document.cookie).not.toContain("integral-session");
  });

  it("mounts nothing and clears the hint on 401", async () => {
    hint();
    serve(401, {});
    stop = preview();
    await vi.waitFor(() => expect(document.cookie).not.toContain("integral-session"));
    await new Promise((r) => setTimeout(r));
    expect(mountAdminBar).not.toHaveBeenCalled();
  });

  it("mounts nothing and keeps the hint on another error", async () => {
    hint();
    serve(500, {});
    stop = preview();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r));
    expect(mountAdminBar).not.toHaveBeenCalled();
    expect(document.cookie).toContain("integral-session=1");
  });

  it("unmounts the bar and removes its host on stop", async () => {
    hint();
    stop = preview();
    await mounted();
    stop();
    expect(handle.unmount).toHaveBeenCalled();
    expect(document.querySelector("[data-cms-bar]")).toBeNull();
  });

  it("mounts nothing when stopped before the bar loads", async () => {
    hint();
    stop = preview();
    stop();
    await new Promise((r) => setTimeout(r, 10));
    expect(mountAdminBar).not.toHaveBeenCalled();
    expect(document.querySelector("[data-cms-bar]")).toBeNull();
  });

  it("shows only preview controls, then restores the normal bar when dismissed", async () => {
    window.name = "integral-preview-1";
    history.replaceState(null, "", "/posts/current?lang=de#title");
    serveModes();
    stop = preview();
    const ctx = await mounted();
    const host = document.querySelector("[data-cms-bar]");
    expect(ctx.mode).toBe("preview-tab");
    expect(ctx.items.map((item) => item.id)).toEqual(["edit", "live-edit"]);
    expect(ctx.items[0]).toMatchObject({
      label: "Back to visual editor",
      href: `/admin/presentation?url=${encodeURIComponent(location.href)}`,
    });
    ctx.setEdit(true);
    ctx.dismiss();
    expect(window.name).toBe("");
    expect(location.reload).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute("data-cms-edit")).toBe(false);
    expect(document.querySelector("[data-cms-bar]")).toBe(host);
    expect((host as HTMLElement).hidden).toBe(false);
    expect(handle.update.mock.lastCall![0]).toMatchObject({ mode: "site", edit: false });
    await vi.waitFor(() =>
      expect(handle.update.mock.lastCall![0].items.map((item) => item.id)).toEqual([
        "dashboard",
        "edit",
        "perspective",
        "purge",
      ]),
    );
    expect(mountAdminBar).toHaveBeenCalledTimes(1);
    expect(handle.unmount).not.toHaveBeenCalled();
    stop();
    expect(handle.unmount).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-cms-bar]")).toBeNull();
  });

  it("disconnects live updates, highlights and edit clicks after leaving preview", async () => {
    window.name = "integral-preview-posts:exit";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    document.body.innerHTML = `<h1 data-cms="posts:exit:title">Original</h1>`;
    stop = preview();
    const ctx = await mounted();
    const send = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          source: opener as never,
          origin: location.origin,
        }),
      );
    send({ type: "mode", edit: true });
    send({ type: "highlight", collection: "posts", id: "exit" });
    expect(document.querySelector("[data-cms-highlight]")).not.toBeNull();
    ctx.dismiss();
    opener.postMessage.mockClear();
    send({ type: "mode", edit: true });
    send({ type: "draft", collection: "posts", id: "exit", data: { title: "Draft" } });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector("h1")!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(document.querySelector("h1")!.textContent).toBe("Original");
    expect(document.querySelector("[data-cms-highlight]")).toBeNull();
    expect(document.documentElement.hasAttribute("data-cms-edit")).toBe(false);
    expect(opener.postMessage).not.toHaveBeenCalled();
    serve(401, {});
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(document.querySelector("[data-cms-bar]")).toBeNull());
  });

  it("keeps the edit switch and the admin's mode message in sync", async () => {
    window.name = "integral-preview-1";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    stop = preview();
    const ctx = await mounted();
    const html = document.documentElement;
    ctx.setEdit(true);
    expect(html.hasAttribute("data-cms-edit")).toBe(true);
    expect(handle.update.mock.lastCall![0].edit).toBe(true);
    const mode = { data: { type: "mode", edit: false }, origin: location.origin, source: opener };
    window.dispatchEvent(new MessageEvent("message", mode as never));
    expect(html.hasAttribute("data-cms-edit")).toBe(false);
    expect(handle.update.mock.lastCall![0].edit).toBe(false);
  });

  it("does not apply a pending saved-page refresh after leaving preview", async () => {
    window.name = "integral-preview-posts:pending";
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("opener", opener);
    document.body.innerHTML = `<h1>Keep this page</h1>`;
    stop = preview({ morph: true });
    const ctx = await mounted();
    let finish!: (html: string) => void;
    const text = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text })),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "saved", collection: "posts", id: "pending" },
        source: opener as never,
        origin: location.origin,
      }),
    );
    await vi.waitFor(() => expect(text).toHaveBeenCalled());
    ctx.dismiss();
    finish("<html><body><h1>Late refresh</h1></body></html>");
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.querySelector("h1")!.textContent).toBe("Keep this page");
  });

  it("switches the perspective and reloads", async () => {
    hint();
    stop = preview();
    const ctx = await mounted();
    const post = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", post);
    ctx.setPerspective("published");
    await vi.waitFor(() => expect(location.reload).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/cms/preview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ perspective: "published" }),
    });
  });
});

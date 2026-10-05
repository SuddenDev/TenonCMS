// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminBarContext } from "../../admin/index.d.ts";
import { addAdminBarItem, preview, type Unsubscribe } from "../index.ts";
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
  const mounted = async () => {
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    return mountAdminBar.mock.calls[0]![1];
  };

  beforeEach(() => {
    window.name = "";
    document.cookie = "integral-preview=; max-age=0; path=/";
    document.cookie = "integral-session=; max-age=0; path=/";
    document.body.innerHTML = "";
    serve(200, { position: "bottom", items: builtIns("site") });
    vi.spyOn(location, "reload").mockImplementation(() => {});
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mountAdminBar.mockClear();
    handle.update.mockClear();
    handle.unmount.mockClear();
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

  it("mounts the admin bar with the filled items for the session hint", async () => {
    hint();
    cookie("drafts");
    document.body.innerHTML = `<h1 data-cms="pages:p1:title"></h1><p data-cms="pages:p1:body"></p>`;
    stop = preview({ admin: "/cms" });
    const ctx = await mounted();
    expect(fetch).toHaveBeenCalledWith(
      `/api/cms/admin-bar?url=${encodeURIComponent(location.href)}`,
      { credentials: "same-origin" },
    );
    expect(document.documentElement.lastElementChild!.hasAttribute("data-cms-bar")).toBe(true);
    expect(mountAdminBar.mock.calls[0]![0]).toBeInstanceOf(ShadowRoot);
    expect(ctx).toMatchObject({
      position: "bottom",
      mode: "site",
      perspective: "drafts",
      edit: false,
    });
    expect(ctx.items).toEqual([
      { id: "dashboard", group: "start", order: 10, label: "Dashboard", href: "/cms" },
      {
        id: "edit",
        group: "end",
        order: 10,
        label: "Edit pages",
        href: "/cms/content/collections/pages/p1",
      },
      {
        id: "live-edit",
        group: "end",
        order: 20,
        label: "Live edit",
        href: `/cms/presentation?url=${encodeURIComponent(location.href)}`,
      },
      { id: "perspective", group: "end", order: 30, label: "Drafts" },
    ]);
  });

  it("lists several bound documents under one Edit item", async () => {
    hint();
    document.body.innerHTML = `<h1 data-cms="posts:x:title"></h1><footer data-cms="footer::text"></footer>`;
    stop = preview({ admin: "/cms" });
    const edit = (await mounted()).items.find((i) => i.id === "edit");
    expect(edit).toEqual({
      id: "edit",
      group: "end",
      order: 10,
      label: "Edit",
      children: [
        { id: "edit:posts:x", label: "Edit posts", href: "/cms/content/collections/posts/x" },
        { id: "edit:footer:", label: "Edit footer", href: "/cms/content/globals/footer" },
      ],
    });
  });

  it("drops Edit without bound documents and keeps labels the hooks changed", async () => {
    hint();
    serve(200, {
      position: "top",
      items: [
        { id: "dashboard", group: "start", order: 10, label: "Back office" },
        { id: "edit", group: "end", order: 10, label: "Edit" },
        { id: "analytics", label: "Analytics", href: "/stats" },
      ],
    });
    stop = preview();
    expect((await mounted()).items).toEqual([
      { id: "dashboard", group: "start", order: 10, label: "Back office", href: "/admin" },
      { id: "analytics", label: "Analytics", href: "/stats" },
    ]);
  });

  it("finds documents bound after the first scan", async () => {
    hint();
    stop = preview();
    await mounted();
    document.body.innerHTML = `<h1 data-cms="posts:x:title"></h1>`;
    document.dispatchEvent(new Event("DOMContentLoaded"));
    const ctx = handle.update.mock.lastCall![0];
    expect(ctx.items.find((i) => i.id === "edit")?.label).toBe("Edit posts");
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

  it("updates the bar with items from page code and removes them again", async () => {
    hint();
    stop = preview();
    await mounted();
    const remove = addAdminBarItem({ id: "purge", label: "Purge", onClick: () => {} });
    expect(handle.update.mock.lastCall![0].items.at(-1)).toMatchObject({ id: "purge" });
    remove();
    expect(handle.update.mock.lastCall![0].items.some((i) => i.id === "purge")).toBe(false);
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

  it("mounts the bar in a preview tab without the hint, with Exit preview", async () => {
    window.name = "integral-preview-1";
    stop = preview();
    const ctx = await mounted();
    expect(ctx.mode).toBe("preview-tab");
    expect(ctx.items.find((i) => i.id === "live-edit")).toEqual({
      id: "live-edit",
      group: "end",
      order: 20,
      label: "Live edit",
    });
    ctx.items.find((i) => i.id === "exit-preview")!.onClick!();
    expect(window.name).toBe("");
    expect(location.reload).toHaveBeenCalled();
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

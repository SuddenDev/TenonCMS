// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminBarContext, AdminBarItem } from "../../admin/index.d.ts";
import type { AdminBar } from "./admin-bar.ts";
import { builtIns } from "./admin-bar-items.ts";

let shown: AdminBarContext;
const handle = {
  update: vi.fn((ctx: AdminBarContext) => {
    shown = ctx;
  }),
  unmount: vi.fn(),
};
const mountAdminBar = vi.fn((_el: ShadowRoot, ctx: AdminBarContext) => {
  shown = ctx;
  return handle;
});
vi.mock("integral-cms/admin/bar", () => ({ mountAdminBar }));
const refs = vi.hoisted(() => ({ registry: {} as Record<string, () => Promise<unknown>> }));
vi.mock("#integral/client-registry", () => ({ default: refs.registry }));

type Answer = { status?: number; body?: unknown };
type Bar = (query: URLSearchParams) => Answer | Promise<Answer>;
type Load = (body: { kind: string; id: string; url: string }) => Answer | Promise<Answer>;

const ref = (name: string) => ({ clientRef: name });
const stub = (id: string, extra: object = {}) => ({ id, label: id, ...extra });
const answer = (items: object[], extra: object = {}) => ({
  body: { position: "bottom-center", items, branding: {}, ...extra },
});

let stopBar: AdminBar["stop"] = () => {};
let bar: Bar;
let load: Load;
let barCalls: URLSearchParams[];
let loadCalls: { kind: string; id: string; url: string }[];
let onSessionEnd: () => void;

const respond = ({ status = 200, body }: Answer) =>
  new Response(JSON.stringify(body ?? {}), { status });

function serve() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.startsWith("/api/cms/admin-bar")) {
        const query = new URL(input, location.origin).searchParams;
        barCalls.push(query);
        return respond(await bar(query));
      }
      const body = JSON.parse(String(init!.body));
      loadCalls.push(body);
      return respond(await load(body));
    }),
  );
}

const start = async (mode: "site" | "preview-tab" = "site", exit?: () => void) => {
  const { startAdminBar } = await import("./admin-bar.ts");
  const running = startAdminBar(mode, "/cms", () => {}, { onSessionEnd, onExit: exit });
  stopBar = running.stop;
  return running;
};
const shownItem = (id: string) => shown.items.find((i) => i.id === id)!;
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const hint = () => {
  document.cookie = "integral-session=1; path=/";
};

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(refs.registry)) delete refs.registry[key];
  document.cookie = "integral-session=; max-age=0; path=/";
  document.cookie = "integral-preview=; max-age=0; path=/";
  document.body.innerHTML = "";
  history.replaceState(null, "", "/posts/1?x=2#top");
  barCalls = [];
  loadCalls = [];
  bar = () => answer(builtIns("site"));
  load = () => ({ body: { item: null } });
  onSessionEnd = vi.fn();
  hint();
  serve();
});
afterEach(() => {
  stopBar();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mountAdminBar.mockClear();
  handle.update.mockClear();
  handle.unmount.mockClear();
});

describe("loading", () => {
  it("asks for the page's path and query with the mode, and shows the filled built-ins", async () => {
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/api/cms/admin-bar?url=%2Fposts%2F1%3Fx%3D2&mode=site", {
      credentials: "same-origin",
    });
    expect(shown.items).toEqual([
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

  it("loads browser code only after the session is confirmed", async () => {
    const code = vi.fn(async () => () => {});
    refs.registry["./c#click"] = code;
    bar = () => ({ status: 401 });
    await start();
    await vi.waitFor(() => expect(onSessionEnd).toHaveBeenCalled());
    expect(code).not.toHaveBeenCalled();
    expect(mountAdminBar).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("integral-session");
  });

  it("serves a native item with children as it is", async () => {
    bar = () =>
      answer([
        stub("docs", { order: 1, href: "/docs" }),
        stub("menu", { order: 2, children: [stub("a", { href: "/a", icon: "bell" })] }),
      ]);
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    expect(shown.items).toEqual([
      { id: "docs", label: "docs", order: 1, href: "/docs" },
      {
        id: "menu",
        label: "menu",
        order: 2,
        children: [{ id: "a", label: "a", href: "/a", icon: "bell" }],
      },
    ]);
  });

  it("adds the page's language to the Edit link", async () => {
    document.documentElement.lang = "de";
    try {
      await start();
      await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
      expect(shownItem("edit").href).toBe(
        `/cms/presentation?url=${encodeURIComponent(location.href)}&locale=de`,
      );
    } finally {
      document.documentElement.removeAttribute("lang");
    }
  });

  it("fills only the marked built-ins, not an item that replaced one by id", async () => {
    bar = () =>
      answer([
        stub("edit", { order: 1, href: "/mine" }),
        stub("dashboard", { order: 2, onClick: ref("./c#go") }),
        stub("perspective", { order: 3, label: "Mine" }),
        stub("live-edit", { order: 4, label: "Plain" }),
      ]);
    refs.registry["./c#go"] = async () => () => {};
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    expect(shownItem("edit").href).toBe("/mine");
    expect(shownItem("dashboard").href).toBeUndefined();
    expect(shownItem("perspective")).toEqual({ id: "perspective", order: 3, label: "Mine" });
  });

  it("does not fill a label-only replacement of dashboard or edit", async () => {
    bar = () => answer([stub("dashboard", { label: "Home" }), stub("edit", { label: "Change" })]);
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    expect(shownItem("dashboard").href).toBeUndefined();
    expect(shownItem("edit").href).toBeUndefined();
  });

  it("skips an item whose reference fails, logs it and keeps the others", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    bar = () =>
      answer([
        stub("ok", { order: 1, href: "/ok" }),
        stub("missing", { order: 2, onClick: ref("./nope#x") }),
        stub("empty", { order: 3, mount: ref("./empty#x") }),
        stub("menu", {
          order: 4,
          children: [stub("fine", { href: "/f" }), stub("broken", { onClick: ref("./nope#y") })],
        }),
      ]);
    refs.registry["./empty#x"] = async () => undefined;
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    expect(shown.items.map((i) => i.id)).toEqual(["ok", "menu"]);
    expect(shownItem("menu").children!.map((i) => i.id)).toEqual(["fine"]);
    expect(error).toHaveBeenCalledTimes(3);
  });
});

describe("click items", () => {
  const click = vi.fn();
  beforeEach(() => {
    click.mockReset();
    refs.registry["./c#click"] = async () => click;
  });

  it("calls the handler with the bar context, the item's data and a scoped reload", async () => {
    bar = () =>
      answer([
        stub("c", { order: 1, onClick: ref("./c#click"), data: { n: 1 } }),
        stub("other", { href: "/o", data: 5 }),
      ]);
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    shownItem("c").onClick!();
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(click.mock.calls[0]![0]).toMatchObject({
      mode: "site",
      position: "bottom-center",
      perspective: "published",
      edit: false,
      data: { n: 1 },
      integral: { reload: expect.any(Function) },
    });
  });

  it("passes the latest context at click time, also to an old item object", async () => {
    let n = 1;
    bar = () => answer([stub("c", { onClick: ref("./c#click"), data: { n } })]);
    const running = await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    const old = shownItem("c");
    n = 2;
    history.pushState(null, "", "/posts/2");
    await vi.waitFor(() => expect(barCalls).toHaveLength(2));
    await vi.waitFor(() => expect(shownItem("c")).not.toBe(old));
    running.setEdit(true);
    old.onClick!();
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(click.mock.calls[0]![0]).toMatchObject({ data: { n: 2 }, edit: true });
  });

  it("gives a click handler a null result as data and no data without a load", async () => {
    bar = () =>
      answer([
        stub("c", { order: 1, onClick: ref("./c#click"), data: null }),
        stub("d", { order: 2, onClick: ref("./c#click") }),
      ]);
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    shownItem("c").onClick!();
    shownItem("d").onClick!();
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(click.mock.calls[0]![0].data).toBeNull();
    expect(click.mock.calls[1]![0].data).toBeUndefined();
  });
});

describe("mount items", () => {
  const unmount = vi.fn();
  const update = vi.fn();
  const mount = vi.fn((_el: HTMLElement, _ctx: any) => ({ update, unmount }));
  beforeEach(() => {
    for (const fn of [unmount, update, mount]) fn.mockClear();
    refs.registry["./m#mount"] = async () => mount;
  });

  it("mounts into the element with the item context and keeps the lifecycle", async () => {
    bar = () => answer([stub("m", { mount: ref("./m#mount"), data: { rows: [1] } })]);
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    const el = document.createElement("div");
    const result = shownItem("m").mount!(el, shown) as {
      update(c: AdminBarContext): void;
      unmount(): void;
    };
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    expect(mount.mock.calls[0]![0]).toBe(el);
    expect(mount.mock.calls[0]![1]).toMatchObject({
      mode: "site",
      data: { rows: [1] },
      integral: { reload: expect.any(Function) },
    });

    result.update({ ...shown, perspective: "drafts" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ perspective: "drafts", data: { rows: [1] } }),
    );
    result.unmount();
    expect(unmount).toHaveBeenCalledOnce();
  });

  it("does not mount after cleanup and applies the latest context when it does", async () => {
    bar = () => answer([stub("m", { mount: ref("./m#mount") })]);
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    const el = document.createElement("div");
    const early = shownItem("m").mount!(el, shown) as { unmount(): void };
    early.unmount();
    await tick();
    expect(mount).not.toHaveBeenCalled();
  });

  it("passes new data through update after the item reloads", async () => {
    let rows = [1];
    bar = () => answer([stub("m", { mount: ref("./m#mount"), data: { rows } })]);
    load = () => ({
      body: { item: stub("m", { mount: ref("./m#mount"), data: { rows: [1, 2] } }) },
    });
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    const result = shownItem("m").mount!(document.createElement("div"), shown) as {
      update(c: AdminBarContext): void;
    };
    await vi.waitFor(() => expect(mount).toHaveBeenCalled());
    await mount.mock.calls[0]![1].integral.reload();
    result.update(shown);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { rows: [1, 2] } }));
    rows = [];
  });
});

describe("dropdown children", () => {
  it("renders every kind of child with its own data", async () => {
    const click = vi.fn();
    const unmount = vi.fn();
    const mount = vi.fn((_el: HTMLElement, _ctx: any) => unmount);
    refs.registry["./c#click"] = async () => click;
    refs.registry["./m#mount"] = async () => mount;
    bar = () =>
      answer([
        stub("menu", {
          order: 1,
          children: [
            stub("link", { href: "/l", icon: "bell" }),
            stub("btn", { onClick: ref("./c#click"), data: "child-data" }),
            stub("mnt", { mount: ref("./m#mount"), data: [3] }),
          ],
        }),
      ]);
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    const [link, btn, mnt] = shownItem("menu").children!;
    expect(link).toEqual({ id: "link", label: "link", href: "/l", icon: "bell" });
    btn!.onClick!();
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(click.mock.calls[0]![0].data).toBe("child-data");
    (mnt!.mount as any)(document.createElement("div"), shown);
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    expect(mount.mock.calls[0]![1].data).toEqual([3]);
  });
});

describe("reloading one item", () => {
  const click = vi.fn();
  let reload: (ctx?: unknown) => Promise<void>;
  beforeEach(() => {
    click.mockReset();
    refs.registry["./c#click"] = async () => click;
    bar = () =>
      answer([
        stub("a", { order: 1, onClick: ref("./c#click"), data: "a1" }),
        stub("b", { order: 2, onClick: ref("./c#click"), data: "b1" }),
      ]);
  });
  const open = async () => {
    const running = await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    click.mockImplementation((ctx) => (reload = ctx.integral.reload));
    shownItem("a").onClick!();
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    return running;
  };
  const dataOf = async (id: string) => {
    click.mockClear();
    shownItem(id).onClick!();
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    return click.mock.calls[0]![0].data;
  };

  it("posts the id and page, replaces only that item and requests no bar", async () => {
    load = ({ id }) => ({
      body: { item: stub(id, { order: 1, onClick: ref("./c#click"), data: "a2" }) },
    });
    await open();
    await reload();
    expect(loadCalls).toEqual([{ kind: "bar-item", id: "a", url: "/posts/1?x=2" }]);
    expect(fetch).toHaveBeenLastCalledWith("/api/cms/admin/load", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(loadCalls[0]),
    });
    expect(barCalls).toHaveLength(1);
    expect(await dataOf("a")).toBe("a2");
    expect(await dataOf("b")).toBe("b1");
    expect(handle.update).toHaveBeenCalled();
  });

  it("removes an item that hides itself", async () => {
    load = () => ({ body: { item: null } });
    await open();
    await reload();
    expect(shown.items.map((i) => i.id)).toEqual(["b"]);
  });

  it("replaces a child inside its dropdown and keeps its sibling", async () => {
    bar = () =>
      answer([
        stub("menu", {
          children: [
            stub("kid", { onClick: ref("./c#click"), data: "old" }),
            stub("kid2", { href: "/k2" }),
          ],
        }),
      ]);
    load = ({ id }) => ({ body: { item: stub(id, { onClick: ref("./c#click"), data: "new" }) } });
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    click.mockImplementation((ctx) => (reload = ctx.integral.reload));
    shownItem("menu").children![0]!.onClick!();
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    await reload();
    expect(loadCalls[0]!.id).toBe("kid");
    const [kid, sibling] = shownItem("menu").children!;
    expect(sibling).toEqual({ id: "kid2", label: "kid2", href: "/k2" });
    click.mockClear();
    kid!.onClick!();
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    expect(click.mock.calls[0]![0].data).toBe("new");
  });

  it("ignores an older response for the same item", async () => {
    const waiting: ((a: Answer) => void)[] = [];
    load = () => new Promise((resolve) => waiting.push(resolve));
    await open();
    const first = reload();
    const second = reload();
    await vi.waitFor(() => expect(waiting).toHaveLength(2));
    const item = (data: string) => ({
      body: { item: stub("a", { order: 1, onClick: ref("./c#click"), data }) },
    });
    waiting[1]!(item("newer"));
    await second;
    waiting[0]!(item("older"));
    await first;
    expect(await dataOf("a")).toBe("newer");
  });

  it("ignores a response that arrives after a full refresh started", async () => {
    let release!: (a: Answer) => void;
    load = () => new Promise((resolve) => (release = resolve));
    await open();
    const pending = reload();
    await vi.waitFor(() => expect(loadCalls).toHaveLength(1));
    history.pushState(null, "", "/posts/3");
    await vi.waitFor(() => expect(barCalls).toHaveLength(2));
    release({ body: { item: null } });
    await pending;
    expect(shown.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("ignores a response after cleanup and a session that ended", async () => {
    let release!: (a: Answer) => void;
    load = () => new Promise((resolve) => (release = resolve));
    const running = await open();
    handle.update.mockClear();
    const pending = reload();
    await vi.waitFor(() => expect(loadCalls).toHaveLength(1));
    running.stop();
    release({ body: { item: null } });
    await pending;
    expect(handle.update).not.toHaveBeenCalled();
  });

  it("ends the session on 401 and stops loading", async () => {
    load = () => ({ status: 401 });
    await open();
    await reload();
    expect(onSessionEnd).toHaveBeenCalled();
    expect(document.querySelector("[data-cms-bar]")).toBeNull();
    history.pushState(null, "", "/posts/9");
    await tick(20);
    expect(barCalls).toHaveLength(1);
  });

  it("rejects when the reload fails", async () => {
    load = () => ({ status: 500 });
    await open();
    await expect(reload()).rejects.toThrow("failed (500)");
    expect(shown.items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("refreshing", () => {
  it("asks again for a new path or query, not for a hash change", async () => {
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    history.pushState(null, "", "/posts/1?x=2#other");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(shownItem("edit").href).toContain(encodeURIComponent("#other"));
    await tick(10);
    expect(barCalls).toHaveLength(1);

    history.pushState(null, "", "/posts/2?x=3");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await vi.waitFor(() => expect(barCalls).toHaveLength(2));
    expect(barCalls[1]!.get("url")).toBe("/posts/2?x=3");
    expect(barCalls[1]!.get("mode")).toBe("site");
  });

  it("detects a navigation without events from DOM changes", async () => {
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    history.pushState(null, "", "/next");
    document.body.append(document.createElement("p"));
    await vi.waitFor(() => expect(barCalls).toHaveLength(2));
  });

  it("keeps the shown items while the new answer loads", async () => {
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    let release!: (a: Answer) => void;
    bar = () => new Promise((resolve) => (release = resolve));
    history.pushState(null, "", "/next");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await vi.waitFor(() => expect(barCalls).toHaveLength(2));
    expect(shown.items.map((i) => i.id)).toEqual(["dashboard", "edit", "perspective"]);
    release(answer([stub("fresh", { href: "/f" })]));
    await vi.waitFor(() => expect(shown.items.map((i) => i.id)).toEqual(["fresh"]));
  });

  it("ignores a response that a newer request replaced", async () => {
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    const waiting: ((a: Answer) => void)[] = [];
    bar = () => new Promise((resolve) => waiting.push(resolve));
    history.pushState(null, "", "/one");
    window.dispatchEvent(new PopStateEvent("popstate"));
    history.pushState(null, "", "/two");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await vi.waitFor(() => expect(waiting).toHaveLength(2));
    waiting[1]!(answer([stub("two", { href: "/2" })]));
    await vi.waitFor(() => expect(shown.items.map((i) => i.id)).toEqual(["two"]));
    waiting[0]!(answer([stub("one", { href: "/1" })]));
    await tick(10);
    expect(shown.items.map((i) => i.id)).toEqual(["two"]);
  });

  it("checks again on focus and removes the bar when the session ended", async () => {
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(barCalls).toHaveLength(2));
    bar = () => ({ status: 401 });
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(document.querySelector("[data-cms-bar]")).toBeNull());
    expect(onSessionEnd).toHaveBeenCalledOnce();
    expect(document.cookie).not.toContain("integral-session");
    history.pushState(null, "", "/after");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await tick(10);
    expect(barCalls).toHaveLength(3);
  });

  it("keeps the bar when a refresh fails", async () => {
    await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    bar = () => ({ status: 500 });
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(barCalls).toHaveLength(2));
    await tick();
    expect(shown.items).toHaveLength(3);
    expect(handle.unmount).not.toHaveBeenCalled();
  });

  it("calls no loader on DOM changes, scrolling or the edit switch", async () => {
    const running = await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    document.body.append(document.createElement("section"));
    window.dispatchEvent(new Event("scroll"));
    running.setEdit(true);
    running.setEdit(false);
    await tick(20);
    expect(barCalls).toHaveLength(1);
    expect(loadCalls).toHaveLength(0);
  });

  it("mounts once when a refresh overtakes the first answer", async () => {
    const waiting: ((a: Answer) => void)[] = [];
    bar = () => new Promise((resolve) => waiting.push(resolve));
    await start();
    await vi.waitFor(() => expect(waiting).toHaveLength(1));
    history.pushState(null, "", "/two");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await vi.waitFor(() => expect(waiting).toHaveLength(2));
    waiting[0]!(answer([stub("one", { href: "/1" })]));
    waiting[1]!(answer([stub("two", { href: "/2" })]));
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalledOnce());
    expect(shown.items.map((i) => i.id)).toEqual(["two"]);
  });
});

describe("disposal", () => {
  it("mounts nothing when stopped before the answer arrives", async () => {
    let release!: (a: Answer) => void;
    bar = () => new Promise((resolve) => (release = resolve));
    const running = await start();
    await vi.waitFor(() => expect(barCalls).toHaveLength(1));
    running.stop();
    release(answer(builtIns("site")));
    await tick(10);
    expect(mountAdminBar).not.toHaveBeenCalled();
    expect(document.querySelector("[data-cms-bar]")).toBeNull();
  });

  it("unmounts the bar and ignores later navigation", async () => {
    const running = await start();
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    running.stop();
    expect(handle.unmount).toHaveBeenCalledOnce();
    history.pushState(null, "", "/after");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new Event("focus"));
    await tick(10);
    expect(barCalls).toHaveLength(1);
  });
});

describe("preview tab", () => {
  it("asks for the fixed controls only and never loads browser code", async () => {
    bar = (q) => answer(builtIns(q.get("mode") as "site" | "preview-tab"));
    await start("preview-tab");
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    expect(barCalls[0]!.get("mode")).toBe("preview-tab");
    expect(shown.mode).toBe("preview-tab");
    expect(shown.items.map((i) => i.id)).toEqual(["edit", "live-edit"]);
    expect(shownItem("edit").href).toBe(
      `/cms/presentation?url=${encodeURIComponent(location.href)}`,
    );
  });

  it("requests no site items on navigation, then loads them when the normal bar returns", async () => {
    bar = (q) =>
      q.get("mode") === "site"
        ? answer([stub("custom", { href: "/c" })])
        : answer(builtIns("preview-tab"));
    const exit = vi.fn();
    await start("preview-tab", exit);
    await vi.waitFor(() => expect(mountAdminBar).toHaveBeenCalled());
    history.pushState(null, "", "/elsewhere");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await tick(10);
    expect(barCalls.map((q) => q.get("mode"))).toEqual(["preview-tab"]);

    shown.dismiss();
    expect(exit).toHaveBeenCalledOnce();
    expect(shown.mode).toBe("site");
    expect(shown.items).toEqual([]);
    await vi.waitFor(() => expect(shown.items.map((i) => i.id)).toEqual(["custom"]));
    expect(barCalls.map((q) => q.get("mode"))).toEqual(["preview-tab", "site"]);
    expect(barCalls[1]!.get("url")).toBe("/elsewhere");
    expect(mountAdminBar).toHaveBeenCalledOnce();
  });
});

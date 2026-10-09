// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick, shallowRef, type App } from "vue";
import type { AdminBarContext } from "../../../core/src/admin/index.d.ts";
import AdminBar from "./AdminBar.vue";
import type { BarItem } from "./kind";

let app: App | undefined;
let root: HTMLElement;

afterEach(() => {
  app?.unmount();
  root?.remove();
});

const render = (ctx: AdminBarContext) => {
  root = document.createElement("div");
  const el = document.createElement("div");
  const portal = document.createElement("div");
  root.append(el, portal);
  document.body.append(root);
  const context = shallowRef(ctx);
  app = createApp({ render: () => h(AdminBar, { ctx: context.value, root, portal }) });
  app.mount(el);
  return context;
};

const context = (items: BarItem[]): AdminBarContext => ({
  mode: "site",
  position: "bottom-center",
  name: "Example site",
  items,
  edit: false,
  perspective: "drafts",
  dismiss: vi.fn(),
  setEdit: vi.fn(),
  setPerspective: vi.fn(),
});

const labels = () =>
  [...root.querySelectorAll("a, button")].map(
    (el) => el.getAttribute("aria-label") ?? el.textContent!.trim(),
  );

it("renders built-ins, callbacks and custom mounts inline in the supplied order", async () => {
  const onClick = vi.fn();
  const update = vi.fn();
  const unmount = vi.fn();
  const ctx = context([
    { id: "dashboard", label: "Dashboard", href: "/admin", builtIn: true },
    { id: "before", label: "Before edit", onClick },
    { id: "edit", label: "Edit", href: "/admin/presentation" },
    {
      id: "between",
      label: "Between",
      mount(el) {
        const button = document.createElement("button");
        button.textContent = "Between";
        el.append(button);
        return { update, unmount };
      },
    },
    { id: "perspective", label: "Drafts", builtIn: true },
  ]);
  const current = render(ctx);
  expect(labels()).toEqual([
    "Example site",
    "Before edit",
    "Edit",
    "Between",
    "Drafts",
    "Dismiss admin bar",
  ]);
  [...root.querySelectorAll("button")].find((el) => el.textContent === "Before edit")!.click();
  expect(onClick).toHaveBeenCalledOnce();
  current.value = { ...ctx, perspective: "published" };
  await nextTick();
  expect(update).toHaveBeenCalledWith(current.value);
  app!.unmount();
  app = undefined;
  expect(unmount).toHaveBeenCalledOnce();
});

it("keeps preview controls separate and restores item order when preview exits", async () => {
  const preview = {
    ...context([
      { id: "edit", label: "Back to visual editor", href: "/admin/presentation" },
      { id: "live-edit", label: "Edit preview", builtIn: true },
    ]),
    mode: "preview-tab" as const,
  };
  const current = render(preview);
  expect(labels()).toEqual(["Back to visual editor", "Edit preview", "Exit preview"]);
  current.value = context([
    { id: "edit", label: "Edit", href: "/admin/presentation" },
    { id: "custom", label: "Custom", onClick: vi.fn() },
    { id: "dashboard", label: "Dashboard", href: "/admin", builtIn: true },
  ]);
  await nextTick();
  expect(labels()).toEqual(["Edit", "Custom", "Example site", "Dismiss admin bar"]);
});

const labelsInOrder = () =>
  [...root.querySelectorAll("a, button, label")].map(
    (el) => el.getAttribute("aria-label") ?? el.textContent!.trim(),
  );

it("renders one flat row in the supplied order, in both modes", async () => {
  const items: BarItem[] = [
    { id: "live-edit", label: "Edit preview", builtIn: true },
    { id: "edit", label: "Back", href: "/admin/presentation" },
  ];
  const current = render({ ...context(items), mode: "preview-tab" });
  expect(labelsInOrder()).toEqual(["Edit preview", "Edit preview", "Back", "Exit preview"]);
  current.value = context([
    { id: "b", label: "B", href: "/b" },
    { id: "a", label: "A", href: "/a" },
  ]);
  await nextTick();
  expect(labels()).toEqual(["B", "A", "Dismiss admin bar"]);
  expect(root.querySelectorAll("[aria-hidden='true'][class*='w-px']")).toHaveLength(1);
});

it("renders the untouched built-ins as controls and a replacement by id as the host's item", () => {
  render(
    context([
      { id: "dashboard", label: "Dashboard", href: "/admin", builtIn: true },
      { id: "perspective", label: "Drafts", builtIn: true },
      { id: "live-edit", label: "Edit preview", builtIn: true },
    ]),
  );
  expect(labelsInOrder()).toEqual([
    "Example site",
    "Drafts",
    "Edit preview",
    "Edit preview",
    "Dismiss admin bar",
  ]);
  expect(root.querySelector("[role=switch]")).not.toBeNull();
  app!.unmount();
  root.remove();

  render(
    context([
      { id: "dashboard", label: "Home", href: "/home" },
      { id: "perspective", label: "Mine" },
      { id: "live-edit", label: "Handler", onClick: vi.fn() },
    ]),
  );
  expect(root.querySelector("a[href='/home']")?.getAttribute("aria-label")).toBe("Home");
  expect(root.textContent).toContain("Home");
  expect(root.textContent).not.toContain("Example site");
  expect(root.textContent).not.toContain("Published");
  expect(root.textContent).not.toContain("Drafts");
  expect(root.querySelector("[role=switch]")).toBeNull();
  expect([...root.querySelectorAll("button")].map((b) => b.textContent!.trim())).toEqual(
    expect.arrayContaining(["Mine", "Handler"]),
  );
});

describe("dropdown children", () => {
  const open = async () => {
    root
      .querySelector<HTMLElement>("[aria-haspopup]")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.querySelector("[role=menu]")).not.toBeNull());
    await nextTick();
    return root.querySelector("[role=menu]")!;
  };

  it("renders a link, a button and a mount like items", async () => {
    const onClick = vi.fn();
    const unmount = vi.fn();
    const mount = vi.fn((el: HTMLElement) => {
      el.append("custom child");
      return unmount;
    });
    render(
      context([
        {
          id: "menu",
          label: "Menu",
          children: [
            { id: "link", label: "Docs", href: "/docs" },
            { id: "btn", label: "Run", onClick },
            { id: "mnt", label: "Custom", mount },
          ],
        },
      ]),
    );
    const menu = await open();
    const link = menu.querySelector("[role=menuitem] a, a[role=menuitem]");
    expect(link?.getAttribute("href")).toBe("/docs");
    const run = [...menu.querySelectorAll("[role=menuitem]")].find((el) =>
      el.textContent?.includes("Run"),
    )!;
    run.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    run.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(mount).toHaveBeenCalledOnce();
    expect(menu.textContent).toContain("custom child");
    expect(menu.querySelectorAll("[role=menuitem]").length).toBe(2);
    // The mount owns its semantics: it is not wrapped in a menu item.
    expect(
      [...menu.querySelectorAll("[role=menuitem]")].some((el) =>
        el.textContent?.includes("custom child"),
      ),
    ).toBe(false);
  });
});

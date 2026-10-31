// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import { client, schema } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import LinkDialog from "./LinkDialog.vue";

let app: App | undefined;
let root: HTMLElement;
beforeEach(() => {
  vi.spyOn(client.links, "resolve").mockImplementation(async (document) => document);
});
afterEach(() => {
  app?.unmount();
  root?.remove();
  vi.restoreAllMocks();
});

async function render(attrs: Record<string, any> = {}) {
  schema.value = {
    collections: {
      posts: { titleField: "name", fields: { name: { type: "text" } } },
    },
    localization: { locales: ["en"], defaultLocale: "en" },
  };
  root = document.createElement("div");
  document.body.append(root);
  const open = ref(false);
  const attributes = ref(attrs);
  app = createApp({
    render: () =>
      h(LinkDialog, {
        attrs: attributes.value,
        open: open.value,
        "onUpdate:open": (value) => (open.value = value),
      }),
  }).use(i18n);
  app.mount(root);
  open.value = true;
  await nextTick();
  return { open, attributes };
}

it("loads the selected title when reopening a saved link outside the search results", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([]);
  const load = vi.spyOn(client, "findById").mockResolvedValue({ id: "saved", name: "Saved post" });
  await render({ reference: { collection: "posts", id: "saved" } });
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Saved post"),
  );

  expect(load).toHaveBeenCalledWith("posts", "saved", {
    locale: "en",
    populate: false,
  });
});

it("keeps the reference visible when its target cannot be loaded", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([]);
  vi.spyOn(client, "findById").mockRejectedValue(new Error("Not found"));
  await render({ reference: { collection: "posts", id: "missing" } });
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("posts:missing"),
  );
  await vi.waitFor(() =>
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Not found"),
  );
});

it("does not apply an old title after reopening for another link", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([]);
  let resolveFirst!: (value: any) => void;
  vi.spyOn(client, "findById")
    .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
    .mockResolvedValueOnce({ id: "second", name: "Second post" });
  const { open, attributes } = await render({ reference: { collection: "posts", id: "first" } });
  open.value = false;
  await nextTick();
  attributes.value = { reference: { collection: "posts", id: "second" } };
  open.value = true;
  await nextTick();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Second post"),
  );
  resolveFirst({ id: "first", name: "First post" });
  await nextTick();

  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("First post");
});

it("omits empty search groups while retaining groups with matches", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([
    { collection: "posts", label: "Posts", items: [{ id: "post", label: "A post" }] },
    { collection: "pages", label: "Pages", items: [] },
  ]);
  await render();
  document.querySelector<HTMLInputElement>('[role="combobox"]')!.focus();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="option"]')?.textContent).toContain("A post"),
  );

  const headings = [...document.querySelectorAll('[data-slot="combobox-group"]')].map(
    (el) => el.textContent,
  );

  expect(headings).toHaveLength(1);
  expect(headings[0]).toContain("Posts");
});

it("shows the empty state without group headings when no targets match", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([
    { collection: "posts", label: "Posts", items: [] },
  ]);
  await render();
  document.querySelector<HTMLInputElement>('[role="combobox"]')!.focus();
  await vi.waitFor(() =>
    expect(document.querySelector('[data-slot="combobox-empty"]')?.textContent).toContain(
      i18n.global.t("common.noMatches"),
    ),
  );

  expect(document.querySelector('[data-slot="combobox-group"]')).toBeNull();
  expect(document.querySelector('[data-slot="combobox-empty"]')?.classList.contains("hidden")).toBe(
    false,
  );
});

it("uses server search results and clears headings when the next search has no matches", async () => {
  const search = vi
    .spyOn(client.links, "search")
    .mockResolvedValueOnce([
      { collection: "posts", label: "Posts", items: [{ id: "post", label: "A post" }] },
    ]);
  await render();

  const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  input.focus();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="option"]')?.textContent).toContain("A post"),
  );
  search.mockResolvedValueOnce([
    { collection: "posts", label: "Posts", items: [{ id: "post", label: "Localized title" }] },
  ]);
  input.value = "post";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() =>
    expect(document.querySelector('[role="option"]')?.textContent).toContain("Localized title"),
  );
  search.mockResolvedValueOnce([{ collection: "posts", label: "Posts", items: [] }]);
  input.value = "missing";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector('[data-slot="combobox-group"]')).toBeNull());

  expect(document.querySelector('[role="option"]')).toBeNull();
});

it("shows the resolved permalink beside a saved reference", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([]);
  vi.spyOn(client, "findById").mockResolvedValue({
    id: "saved",
    name: "Saved post",
    path: "/wrong",
  });
  vi.mocked(client.links.resolve).mockImplementation(async (document) => {
    document.content![0].content![0].marks![0].attrs!.href = "/en/articles/saved";
    return document;
  });
  await render({ reference: { collection: "posts", id: "saved" } });
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("/en/articles/saved"),
  );

  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("/wrong");
  expect(client.links.resolve).toHaveBeenCalledWith(expect.objectContaining({ type: "doc" }), {
    locale: "en",
  });
});

it("shows the permalink after selecting a new reference", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([
    { collection: "posts", label: "Posts", items: [{ id: "post", label: "A post" }] },
  ]);
  vi.spyOn(client, "findById").mockResolvedValue({ id: "post", name: "A post" });
  vi.mocked(client.links.resolve).mockImplementation(async (document) => {
    document.content![0].content![0].marks![0].attrs!.href = "/en/articles/post";
    return document;
  });
  await render();
  document.querySelector<HTMLInputElement>('[role="combobox"]')!.focus();
  await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
  document.querySelector<HTMLElement>('[role="option"]')!.click();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("/en/articles/post"),
  );
});

it("ignores a late permalink response after reopening for another reference", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([]);
  vi.spyOn(client, "findById")
    .mockResolvedValueOnce({ id: "first", name: "First post" })
    .mockResolvedValueOnce({ id: "second", name: "Second post" });
  let finishFirst!: () => void;
  vi.mocked(client.links.resolve)
    .mockImplementationOnce(
      (document) =>
        new Promise((resolve) => {
          finishFirst = () => {
            document.content![0].content![0].marks![0].attrs!.href = "/first";
            resolve(document);
          };
        }),
    )
    .mockImplementationOnce(async (document) => {
      document.content![0].content![0].marks![0].attrs!.href = "/second";
      return document;
    });
  const { open, attributes } = await render({ reference: { collection: "posts", id: "first" } });
  await vi.waitFor(() => expect(client.links.resolve).toHaveBeenCalledOnce());
  open.value = false;
  await nextTick();
  attributes.value = { reference: { collection: "posts", id: "second" } };
  open.value = true;
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("/second"),
  );
  finishFirst();
  await nextTick();

  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("/first");
});

it("keeps the selected title when permalink resolution fails", async () => {
  vi.spyOn(client.links, "search").mockResolvedValue([]);
  vi.spyOn(client, "findById").mockResolvedValue({ id: "saved", name: "Saved post" });
  vi.mocked(client.links.resolve).mockRejectedValue(new Error("Cannot resolve link"));
  await render({ reference: { collection: "posts", id: "saved" } });
  await vi.waitFor(() =>
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Cannot resolve link"),
  );

  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Saved post");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("·");
});

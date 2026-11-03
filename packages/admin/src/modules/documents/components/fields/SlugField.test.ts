// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, reactive, ref, type App } from "vue";
import { i18n } from "@/shared/i18n";
import { client, schema } from "@/shared/api";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { ownerKey } from "@/modules/documents/fields";
import SlugField from "./SlugField.vue";

let app: App | undefined;
let root: HTMLElement;
afterEach(() => {
  app?.unmount();
  root?.remove();
  vi.restoreAllMocks();
});

const pages = [
  { id: "a", title: "About", path: "/about" },
  { id: "t", title: "Team", path: "/about/team" },
];

async function render(parent = true, id?: string) {
  schema.value = { collections: { pages: { titleField: "title", fields: {} } } } as never;
  vi.spyOn(client, "find").mockResolvedValue(pages as never);
  root = document.createElement("div");
  document.body.append(root);

  const data = reactive<Record<string, unknown>>({ parent: "a" });
  const slug = ref<string | null>(null);
  const fields = {
    title: { type: "text" },
    parent: { type: "relation", collection: "pages" },
  };
  app = createApp({
    render: () =>
      h(TooltipProvider, null, () =>
        h(SlugField, {
          name: "slug",
          field: { type: "slug", ...(parent && { parent: "parent", path: "path" }) } as never,
          root: {},
          siblings: { fields: fields as never, data },
          modelValue: slug.value,
          "onUpdate:modelValue": (next) => (slug.value = next),
        }),
      ),
  }).use(i18n);
  app.provide(ownerKey, ref({ collection: "pages", ...(id && { id }) }));
  app.mount(root);
  await vi.waitFor(() => expect(client.find).toHaveBeenCalledTimes(parent ? 1 : 0));
  await nextTick();

  return { data, slug };
}

it("slugifies pasted text", async () => {
  const { slug } = await render(false);
  const input = root.querySelector("input")!;

  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.assign(paste, { clipboardData: { getData: () => "Über uns!" } });
  input.dispatchEvent(paste);
  await nextTick();

  expect(slug.value).toBe("uber-uns");
  expect(paste.defaultPrevented).toBe(true);
});

it("shows a static prefix without `parent`", async () => {
  await render(false);

  expect(root.querySelector('[data-slot="input-group-addon"]')?.textContent?.trim()).toBe("/");
  expect(root.querySelector('[data-slot="input-group-addon"] button')).toBeNull();
});

it("turns the prefix into a button with the parent's path", async () => {
  await render();

  const chip = root.querySelector('[data-slot="input-group-addon"] button');
  expect(chip?.textContent?.trim()).toBe("/about/");
});

it("writes the picked page to the sibling relation", async () => {
  const { data } = await render();

  root.querySelector<HTMLElement>('[data-slot="input-group-addon"] button')!.click();
  await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(options.map((o) => o.textContent?.replace(/\s+/g, " ").trim())).toEqual([
    "/ Top level",
    "/about About",
    "/about/team Team",
  ]);

  options[2]!.click();
  await nextTick();

  expect(data.parent).toBe("t");
});

it("leaves out the page itself and its descendants", async () => {
  await render(true, "a");

  root.querySelector<HTMLElement>('[data-slot="input-group-addon"] button')!.click();
  await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];

  expect(options.map((o) => o.textContent?.replace(/\s+/g, " ").trim())).toEqual(["/ Top level"]);
});

it("clears the parent when the top level is picked", async () => {
  const { data } = await render();

  root.querySelector<HTMLElement>('[data-slot="input-group-addon"] button')!.click();
  await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
  document.querySelector<HTMLElement>('[role="option"]')!.click();
  await nextTick();

  expect(data.parent).toBeNull();
});

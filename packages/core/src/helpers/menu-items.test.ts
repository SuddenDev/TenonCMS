import { expect, expectTypeOf, it } from "vitest";
import { menuItems } from "./menu-items.ts";

const about = { reference: { collection: "pages", id: "1" }, href: "/about", title: "About" };

it("uses the label, else the link's title, else an empty string", () => {
  expect(
    menuItems([
      { id: "a", blockType: "link", label: "Home", link: { href: "/", title: "Start" } },
      { id: "b", blockType: "link", label: null, link: about },
      { id: "c", blockType: "link", link: { href: "https://example.com", target: "_blank" } },
    ]).map(({ label, href, target }) => ({ label, href, target })),
  ).toEqual([
    { label: "Home", href: "/", target: undefined },
    { label: "About", href: "/about", target: undefined },
    { label: "", href: "https://example.com", target: "_blank" },
  ]);
});

it("gives a heading href null and keeps its children", () => {
  expect(
    menuItems([
      {
        id: "h",
        blockType: "heading",
        label: "Products",
        children: [{ id: "l", blockType: "link", link: about }],
      },
    ]),
  ).toEqual([
    {
      id: "h",
      type: "heading",
      label: "Products",
      href: null,
      target: undefined,
      children: [
        { id: "l", type: "link", label: "About", href: "/about", target: undefined, children: [] },
      ],
    },
  ]);
});

it("leaves out a broken link with its children", () => {
  const broken = { reference: { collection: "pages", id: "2" }, href: null, broken: true as const };

  expect(
    menuItems([
      {
        id: "a",
        blockType: "link",
        link: broken,
        children: [{ id: "b", blockType: "link", link: about }],
      },
      {
        id: "c",
        blockType: "heading",
        label: "Help",
        children: [{ id: "d", blockType: "link", link: broken }],
      },
    ]).map((i) => [i.label, i.children.length]),
  ).toEqual([["Help", 0]]);
  expect(menuItems(null)).toEqual([]);
});

it("passes other item fields through with their types", () => {
  const items = menuItems([
    {
      id: "a",
      blockType: "link" as const,
      label: "Mail",
      icon: "mail" as const,
      link: about,
      children: [],
    },
  ]);

  expect(items[0].icon).toBe("mail");
  expectTypeOf(items[0].icon).toEqualTypeOf<"mail">();
  expectTypeOf(items[0].type).toEqualTypeOf<"link">();
  expectTypeOf(items[0].href).toEqualTypeOf<string | null>();
});

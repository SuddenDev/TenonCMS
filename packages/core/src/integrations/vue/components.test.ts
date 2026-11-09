import { createSSRApp, defineComponent, h, type Component, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { Blocks, Link, Richtext, useBlockEdit } from "./index.ts";
import type { RichtextDocument } from "../../richtext/config/types.ts";

const html = (render: () => ReturnType<typeof h>) =>
  renderToString(createSSRApp({ render })).then((s) => s.replace(/<!--\[-->|<!--]-->/g, ""));

describe("Link", () => {
  it("renders an anchor with the link's title", async () => {
    expect(await html(() => h(Link, { link: { href: "/about", title: "About" } }))).toBe(
      '<a href="/about">About</a>',
    );
  });

  it("opens a new tab safely and keeps the slot", async () => {
    const link = { href: "https://x.co", target: "_blank" as const };
    expect(await html(() => h(Link, { link, class: "btn" }, () => "Go"))).toBe(
      '<a href="https://x.co" target="_blank" rel="noopener noreferrer" class="btn">Go</a>',
    );
  });

  it("renders nothing for a broken or missing link", async () => {
    expect(await html(() => h(Link, { link: { href: null, broken: true } }))).toBe("<!---->");
    expect(await html(() => h(Link, { link: null }))).toBe("<!---->");
  });

  it("passes internal paths to an `as` component as `to`, and keeps URLs plain", async () => {
    const RouterLink = defineComponent({
      props: { to: String },
      setup:
        (props, { slots }) =>
        () =>
          h("a", { "data-to": props.to }, slots.default?.()),
    });
    expect(await html(() => h(Link, { link: { href: "/a", title: "A" }, as: RouterLink }))).toBe(
      '<a data-to="/a">A</a>',
    );
    expect(
      await html(() => h(Link, { link: { href: "https://x.co", title: "X" }, as: RouterLink })),
    ).toBe('<a href="https://x.co">X</a>');
  });

  it("merges into its child with asChild", async () => {
    const link = { href: "/a", title: "A" };
    expect(
      await html(() => h(Link, { link, asChild: true }, () => h("button", { class: "b" }, "Hi"))),
    ).toBe('<button class="b" href="/a">Hi</button>');
  });
});

describe("Blocks", () => {
  const Hero = defineComponent({
    props: { block: { type: Object as PropType<{ id: string; title: string }>, required: true } },
    setup(props) {
      const edit = useBlockEdit(props.block);
      return () => h("h1", { "data-cms": edit("title") }, props.block.title);
    },
  });
  const Text: Component = { props: ["block"], render: () => h("p", "text") };
  const blocks = [
    { id: "b1", blockType: "hero", title: "Hi" },
    { id: "b2", blockType: "missing" },
    { id: "b3", blockType: "text" },
  ];

  it("renders a component per block type and skips unknown types", async () => {
    expect(
      await html(() => h(Blocks, { blocks, components: { hero: Hero, text: Text }, class: "c" })),
    ).toBe('<div class="c"><h1>Hi</h1><p>text</p></div>');
  });

  it("binds block fields for click-to-edit", async () => {
    const edit = { collection: "pages", id: "p1", path: "content" };
    expect(await html(() => h(Blocks, { blocks, components: { hero: Hero }, edit }))).toBe(
      '<div><h1 data-cms="pages:p1:content.0.title">Hi</h1></div>',
    );
  });
});

describe("Richtext", () => {
  const content: RichtextDocument = { type: "doc", content: [{ type: "paragraph" }] };

  it("renders into `as` or its child", async () => {
    expect(await html(() => h(Richtext, { content, as: "article" }))).toBe(
      "<article><p></p></article>",
    );
    expect(
      await html(() => h(Richtext, { content, asChild: true }, () => h("section", { id: "s" }))),
    ).toBe('<section id="s"><p></p></section>');
  });
});

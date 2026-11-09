import { createSSRApp, defineComponent, h, type Component, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { Blocks, Image, Link, Picture, Richtext, useBlockEdit } from "./index.ts";
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

  it("renders the blocks into its child with asChild", async () => {
    expect(
      await html(() =>
        h(Blocks, { blocks, components: { hero: Hero }, asChild: true }, () =>
          h("section", { class: "s" }),
        ),
      ),
    ).toBe('<section class="s"><h1>Hi</h1></section>');
  });
});

describe("Image", () => {
  const image = { src: "/a.webp", srcset: "/a-320.webp 320w", width: 800, height: 600, alt: "Sea" };

  it("renders an img with srcset, dimensions and lazy loading", async () => {
    expect(await html(() => h(Image, { image, sizes: "50vw" }))).toBe(
      '<img src="/a.webp" srcset="/a-320.webp 320w" width="800" height="600" alt="Sea" loading="lazy" decoding="async" sizes="50vw">',
    );
  });

  it("drops an empty srcset, defaults alt and binds the preview attributes", async () => {
    const svg = { src: "/a.svg", srcset: "", width: 10, height: 10, alt: null };
    expect(
      await html(() => h(Image, { image: svg, loading: "eager", "data-cms": "posts:1:hero" })),
    ).toBe(
      '<img src="/a.svg" width="10" height="10" alt loading="eager" decoding="async" data-cms-attr="src,srcset,alt" data-cms="posts:1:hero">',
    );
  });

  it("renders nothing without an image", async () => {
    expect(await html(() => h(Image, { image: null }))).toBe("<!---->");
  });
});

describe("Picture", () => {
  const image = { src: "/a.webp", srcset: "/a-640.webp 640w", width: 800, height: 600, alt: "Sea" };
  const tall = { src: "/b.webp", srcset: "/b-320.webp 320w", width: 300, height: 600 };
  const svg = { src: "/c.svg", srcset: "", width: 10, height: 10 };

  it("renders a source per image before the img, with the img's sizes", async () => {
    const sources = [
      { media: "(max-width: 600px)", image: tall },
      { media: "print", image: svg, sizes: "10px" },
      { media: "(min-width: 2000px)", image: null },
    ];
    expect(await html(() => h(Picture, { image, sources, sizes: "100vw", class: "i" }))).toBe(
      '<picture><source srcset="/b-320.webp 320w" sizes="100vw" width="300" height="600" media="(max-width: 600px)"><source srcset="/c.svg" sizes="10px" width="10" height="10" media="print"><img src="/a.webp" srcset="/a-640.webp 640w" width="800" height="600" alt="Sea" loading="lazy" decoding="async" sizes="100vw" class="i"></picture>',
    );
  });

  it("renders nothing without its main image", async () => {
    expect(await html(() => h(Picture, { image: null, sources: [{ image }] }))).toBe("<!---->");
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

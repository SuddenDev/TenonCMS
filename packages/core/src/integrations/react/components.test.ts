import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type BlockProps, Blocks, Image, Link, Picture, Richtext, Seo } from "./index.ts";
import type { RichtextDocument } from "../../richtext/config/types.ts";

const html = (node: ReactNode) => renderToStaticMarkup(node);

describe("Link", () => {
  it("renders an anchor with the link's title", () => {
    expect(html(h(Link, { link: { href: "/about", title: "About" } }))).toBe(
      '<a href="/about">About</a>',
    );
  });

  it("opens a new tab safely and keeps the children", () => {
    const link = { href: "https://x.co", target: "_blank" as const };
    expect(html(h(Link, { link, className: "btn" }, "Go"))).toBe(
      '<a href="https://x.co" target="_blank" rel="noopener noreferrer" class="btn">Go</a>',
    );
  });

  it("renders nothing for a broken or missing link", () => {
    expect(html(h(Link, { link: { href: null, broken: true } }))).toBe("");
    expect(html(h(Link, { link: null }))).toBe("");
  });

  it("passes internal paths to an `as` component as `to`, and keeps URLs plain", () => {
    const RouterLink = ({ to, children }: { to: string; children?: ReactNode }) =>
      h("a", { "data-to": to }, children);
    expect(html(h(Link, { link: { href: "/a", title: "A" }, as: RouterLink }))).toBe(
      '<a data-to="/a">A</a>',
    );
    expect(html(h(Link, { link: { href: "https://x.co", title: "X" }, as: RouterLink }))).toBe(
      '<a href="https://x.co">X</a>',
    );
  });

  it("merges into its child with asChild", () => {
    const link = { href: "/a", title: "A" };
    expect(
      html(h(Link, { link, asChild: true, className: "l" }, h("button", { className: "b" }, "Hi"))),
    ).toBe('<button class="b l" href="/a">Hi</button>');
  });
});

describe("Blocks", () => {
  const Hero = ({ block, edit }: BlockProps<{ title: string }>) =>
    h("h1", { "data-cms": edit("title") }, block.title);
  const Text = () => h("p", null, "text");
  const blocks = [
    { id: "b1", blockType: "hero", title: "Hi" },
    { id: "b2", blockType: "missing" },
    { id: "b3", blockType: "text" },
  ];

  it("renders a component per block type and skips unknown types", () => {
    expect(
      html(h(Blocks, { blocks, components: { hero: Hero, text: Text }, className: "c" })),
    ).toBe('<div class="c"><h1>Hi</h1><p>text</p></div>');
  });

  it("binds block fields for click-to-edit, also into its child", () => {
    const edit = { collection: "pages", id: "p1", path: "content" };
    expect(
      html(h(Blocks, { blocks, components: { hero: Hero }, edit, asChild: true }, h("section"))),
    ).toBe('<section><h1 data-cms="pages:p1:content.0.title">Hi</h1></section>');
  });
});

describe("Richtext", () => {
  const content: RichtextDocument = { type: "doc", content: [{ type: "paragraph" }] };

  it("renders into `as` or its child", () => {
    expect(html(h(Richtext, { content, as: "article" }))).toBe("<article><p></p></article>");
    expect(html(h(Richtext, { content, asChild: true }, h("section", { id: "s" })))).toBe(
      '<section id="s"><p></p></section>',
    );
  });
});

describe("Image", () => {
  it("renders an img with srcset, dimensions and lazy loading", () => {
    const image = {
      src: "/a.webp",
      srcset: "/a-320.webp 320w",
      width: 800,
      height: 600,
      alt: "Sea",
    };
    expect(html(h(Image, { image, sizes: "50vw" }))).toBe(
      '<img src="/a.webp" width="800" height="600" alt="Sea" loading="lazy" decoding="async" sizes="50vw" srcSet="/a-320.webp 320w"/>',
    );
  });

  it("binds the preview attributes and renders nothing without an image", () => {
    const svg = { src: "/a.svg", srcset: "", width: 10, height: 10 };
    expect(html(h(Image, { image: svg, "data-cms": "posts:1:hero" }))).toBe(
      '<img src="/a.svg" width="10" height="10" alt="" loading="lazy" decoding="async" data-cms-attr="src,srcset,alt" data-cms="posts:1:hero"/>',
    );
    expect(html(h(Image, { image: null }))).toBe("");
  });
});

describe("Picture", () => {
  it("renders a source per image before the img", () => {
    const image = { src: "/a.webp", srcset: "/a-640.webp 640w", width: 800, height: 600 };
    const tall = { src: "/b.webp", srcset: "/b-320.webp 320w", width: 300, height: 600 };
    expect(
      html(h(Picture, { image, sources: [{ media: "(max-width: 600px)", image: tall }] })),
    ).toBe(
      '<picture><source width="300" height="600" media="(max-width: 600px)" srcSet="/b-320.webp 320w"/><img src="/a.webp" width="800" height="600" alt="" loading="lazy" decoding="async" srcSet="/a-640.webp 640w"/></picture>',
    );
    expect(html(h(Picture, { image: null, sources: [] }))).toBe("");
  });
});

describe("Seo", () => {
  it("renders the head tags of a page", () => {
    const page = { title: "Hi", path: "/hi", seo: { description: "D" } };
    const out = html(h(Seo, { page, general: { title: "Acme", url: "https://a.co" } }));
    expect(out).toContain("<title>Hi · Acme</title>");
    expect(out).toContain('<meta name="description" content="D"/>');
    expect(out).toContain('<meta property="og:site_name" content="Acme"/>');
    expect(out).toContain('<link rel="canonical" href="https://a.co/hi"/>');
  });
});

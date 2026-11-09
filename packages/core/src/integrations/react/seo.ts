import { createElement, Fragment } from "react";
import { seoHead, type SeoTemplates } from "../../helpers/seo-meta.ts";

type Settings = Parameters<typeof seoHead>[1] & {};

export type SeoProps = {
  page: Parameters<typeof seoHead>[0] | null | undefined;
  general?: Settings["general"];
  seo?: Settings["seo"];
  templates?: SeoTemplates | null;
};

/**
 * Renders the `<head>` tags of `seoHead()` for a page. React 19 moves them into `<head>` from anywhere in the tree.
 * Pass the `general` and `seo` settings globals, which it does not read itself.
 * @example
 * <Seo page={page} general={general} seo={seo} />
 */
export function Seo({ page, general, seo, templates }: SeoProps) {
  const head = seoHead(page ?? {}, { general, seo, templates });
  return createElement(
    Fragment,
    null,
    createElement("title", { key: "title" }, head.title),
    ...head.meta.map((tag) =>
      createElement("meta", { key: "name" in tag ? tag.name : tag.property, ...tag }),
    ),
    ...head.links.map((link) =>
      createElement(
        "link",
        "hreflang" in link
          ? { key: link.hreflang, rel: link.rel, hrefLang: link.hreflang, href: link.href }
          : { key: link.rel, ...link },
      ),
    ),
  );
}

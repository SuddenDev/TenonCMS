/** Loads the page at `path` with what `[...path].astro` shows. */
export const findPage = (cms: App.Locals["tenon"], path: string, locale: App.Locals["locale"]) =>
  cms.findOne("pages", {
    where: { path },
    locale,
    alternates: true,
    populate: { hero: true, seo: { image: true }, content: true },
    select: {
      title: true,
      path: true,
      body: true,
      seo: true,
      hero: true,
      content: true,
      locale: true,
      alternates: true,
    },
  });

/** One content block of a page, at any depth. */
export type PageBlock = NonNullable<
  NonNullable<Awaited<ReturnType<typeof findPage>>>["content"]
>[number];

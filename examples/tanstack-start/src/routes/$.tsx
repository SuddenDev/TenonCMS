import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { seoMeta } from "integral-cms/client";
import { edit } from "integral-cms/preview";
import { useDraft } from "integral-cms/preview/react";
import cms from "../../integral.config";

const getPage = createServerFn()
  .validator((path: string) => path)
  .handler(async ({ data: path }) => {
    // The request's session and preview cookie, so the admin's preview sees drafts.
    const api = await cms.forRequest(getRequest());
    const page = await api.findOne("pages", {
      where: { path },
      populate: { seo: { image: true } },
    });
    if (!page) throw notFound();
    const [general, seo] = await Promise.all([api.getGlobal("general"), api.getGlobal("seo")]);
    return { page, general, seo };
  });

// `/`, `/posts/$slug`, `/admin/$` and `/api/cms/$` win over this route, so a CMS page at `/` never shows.
export const Route = createFileRoute("/$")({
  loader: ({ params }) => getPage({ data: `/${params._splat ?? ""}` }),
  head: ({ loaderData }) => {
    const meta = loaderData && seoMeta(loaderData.page, loaderData);
    return {
      meta: [
        { title: meta?.title },
        ...(meta?.description ? [{ name: "description", content: meta.description }] : []),
        ...(meta?.noindex ? [{ name: "robots", content: "noindex" }] : []),
        ...(meta?.image ? [{ property: "og:image", content: meta.image }] : []),
        ...(meta?.verification ?? []),
      ],
      links: meta?.canonical ? [{ rel: "canonical", href: meta.canonical }] : [],
    };
  },
  component: Page,
  notFoundComponent: () => <p>Page not found</p>,
});

function Page() {
  const page = useDraft("pages", Route.useLoaderData().page);
  return (
    <main>
      <Link to="/">← Home</Link>
      <h1 data-cms={edit("pages", page.id, "title")}>{page.title}</h1>
      <p data-cms={edit("pages", page.id, "body")} style={{ whiteSpace: "pre-wrap" }}>
        {page.body}
      </p>
    </main>
  );
}

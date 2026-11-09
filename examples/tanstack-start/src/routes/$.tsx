import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { seoHead } from "tenoncms/client";
import { edit } from "tenoncms/preview";
import { useDraft } from "tenoncms/preview/react";
import cms from "../../tenon.config";

const getPage = createServerFn()
  .validator((path: string) => path)
  .handler(async ({ data: path }) => {
    // The request's session and preview cookie, so the admin's preview sees drafts.
    const api = await cms.withSession(getRequest());
    const page = await api.findOne("pages", {
      where: { path },
      populate: { seo: { image: true } },
    });
    if (!page) throw notFound();
    const [general, seo] = await Promise.all([api.getGlobal("general"), api.getGlobal("seo")]);
    return { page, general, seo };
  });

// `/`, `/posts/$slug`, `/admin/$` and `/_tenon/$` win over this route, so a CMS page at `/` never shows.
export const Route = createFileRoute("/$")({
  loader: ({ params }) => getPage({ data: `/${params._splat ?? ""}` }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { title, meta, links } = seoHead(loaderData.page, loaderData);
    return { meta: [{ title }, ...meta], links };
  },
  component: Page,
  notFoundComponent: () => <p>Page not found</p>,
});

function Page() {
  const page = useDraft("pages", Route.useLoaderData().page);
  return (
    <main>
      <h1 data-cms={edit("pages", page.id, "title")}>{page.title}</h1>
      {page.content?.map((item, i) => (
        <p
          key={item.id}
          data-cms={edit("pages", page.id, `content.${i}.body`)}
          style={{ whiteSpace: "pre-wrap" }}
        >
          {item.body}
        </p>
      ))}
    </main>
  );
}

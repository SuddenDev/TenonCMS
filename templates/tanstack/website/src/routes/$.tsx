import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { menuItems, seoHead } from "tenoncms/client";
import { edit } from "tenoncms/preview";
import { useDraft } from "tenoncms/preview/react";
import { Blocks } from "tenoncms/react";
import cms from "../../tenon.config";
import { Hero } from "../blocks/Hero";
import { Image } from "../blocks/Image";
import { List } from "../blocks/List";
import { Text } from "../blocks/Text";
import { ThemeSwitch } from "../components/ThemeSwitch";

const getPage = createServerFn()
  .validator((path: string) => path)
  .handler(async ({ data: path }) => {
    // The request's session and preview cookie, so the admin's preview sees drafts.
    const api = await cms.withSession(getRequest());
    const [page, general, seo, menu] = await Promise.all([
      api.findOne("pages", { where: { path } }),
      api.getGlobal("general"),
      api.getGlobal("seo"),
      api.getGlobal("mainMenu"),
    ]);
    if (!page) throw notFound();
    return { page, general, seo, menu: menuItems(menu.items), site: cms.site.url };
  });

// Every URL lands here and shows the page with that path. `/` is the page with the slug `index`.
export const Route = createFileRoute("/$")({
  loader: ({ params }) => getPage({ data: `/${params._splat ?? ""}` }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { title, meta, links } = seoHead(loaderData.page, loaderData);
    return { meta: [{ title }, ...meta], links };
  },
  component: Page,
  notFoundComponent: () => <p className="wrap">Page not found</p>,
});

const blocks = { hero: Hero, image: Image, text: Text, list: List };

function Page() {
  const data = Route.useLoaderData();
  const page = useDraft("pages", data.page);
  const siteName = data.general.title || "Home";
  return (
    <>
      <header className="wrap header">
        <a className="brand" href="/" data-cms={edit("general", null, "title")}>
          {siteName}
        </a>
        <div className="header-end">
          <nav aria-label="Main">
            <ul className="nav">
              {data.menu.map((item, i) => (
                <li key={i}>
                  <a
                    href={item.href ?? undefined}
                    target={item.target}
                    aria-current={item.href === page.path ? "page" : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeSwitch />
        </div>
      </header>
      <Blocks
        as="main"
        blocks={page.content}
        components={blocks}
        edit={{ collection: "pages", id: page.id, path: "content" }}
      />
      <footer className="footer">
        <div className="wrap">
          <span>
            © {new Date().getFullYear()} {siteName}
          </span>
          <span>
            Built with <a href="https://github.com/SuddenDev/TenonCMS">tenoncms</a>
          </span>
        </div>
      </footer>
    </>
  );
}

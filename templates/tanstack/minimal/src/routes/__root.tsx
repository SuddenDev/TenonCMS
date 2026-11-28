import geist from "@fontsource-variable/geist/index.css?url";
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { preview } from "tenoncms/preview";
import { useEffect } from "react";
import cms from "../../tenon.config";
import { ThemeSwitch, themeScript } from "../components/ThemeSwitch";
import site from "../styles/site.css?url";

// The site title from Settings in the admin.
const getSiteTitle = createServerFn().handler(
  async () => (await cms.getGlobal("general")).title || "Home",
);

export const Route = createRootRoute({
  loader: () => getSiteTitle(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [
      { rel: "stylesheet", href: geist },
      { rel: "stylesheet", href: site },
    ],
  }),
  component: Root,
});

function Root() {
  const siteTitle = Route.useLoaderData();
  useEffect(() => preview(), []);
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <header className="wrap header">
          <Link className="brand" to="/">
            {siteTitle}
          </Link>
          <div className="header-end">
            <a href="/admin">Admin ↗</a>
            <ThemeSwitch />
          </div>
        </header>
        <Outlet />
        <footer className="wrap">
          <div className="footer">
            <span>Built with tenoncms</span>
            <nav aria-label="Tenon">
              <a href="https://tenoncms.com/docs">Docs</a>
              <a href="https://github.com/SuddenDev/TenonCMS">GitHub</a>
            </nav>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}

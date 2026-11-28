import geist from "@fontsource-variable/geist/index.css?url";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { preview } from "tenoncms/preview";
import { useEffect } from "react";
import { themeScript } from "../components/ThemeSwitch";
import site from "../styles/site.css?url";

export const Route = createRootRoute({
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
  useEffect(() => preview(), []);
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

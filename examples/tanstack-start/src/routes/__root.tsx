import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { preview } from "integral-cms/preview";
import { useEffect } from "react";
import cms from "../../integral.config";

const getPages = createServerFn().handler(async () =>
  (await cms.find("pages", { select: { title: true, path: true } })).filter((p) => p.path),
);

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  loader: () => getPages(),
  component: Root,
});

function Root() {
  const pages = Route.useLoaderData();
  useEffect(() => preview(), []);
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav aria-label="Main" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Link to="/">
              <strong>Home</strong>
            </Link>
            <Link to="/" hash="posts">
              Posts
            </Link>
            {pages.map((page) => (
              <a key={page.id} href={page.path!}>
                {page.title}
              </a>
            ))}
            <a href="/admin">Admin</a>
          </nav>
        </header>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

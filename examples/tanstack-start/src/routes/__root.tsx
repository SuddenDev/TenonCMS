import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { preview } from "integral-cms/preview";
import { useEffect } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: Root,
});

function Root() {
  useEffect(() => preview(), []);
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

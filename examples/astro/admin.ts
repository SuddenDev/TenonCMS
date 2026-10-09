import { clientRef, type AdminOptions } from "integral-cms/admin";

// Only the `load` functions run on the server. Each `clientRef()` names a browser export, relative to the project root.
export const admin = {
  name: "Example site",
  media: { nav: { group: "Blog", icon: "images" } },
  fields: {
    color: { mount: clientRef("./src/admin/color.ts#mountColor") },
  },
  pages: {
    // `load` reads CMS data on the server. The mount gets it as `ctx.data`.
    stats: {
      title: "Stats",
      nav: { icon: "chart-bar" },
      load: async ({ cms, user }) => ({
        editor: user.name,
        posts: await cms.find("posts", { limit: 10, populate: false, select: { title: true } }),
      }),
      mount: clientRef("./src/admin/pages.ts#mountStats"),
    },
    dashboard: {
      title: "Dashboard",
      nav: { display: "main", order: 1 },
      route: "/",
      pageHeader: clientRef("./src/admin/pages.ts#dashboardHeader"),
      mount: clientRef("./src/admin/pages.ts#mountDashboard"),
    },
    post: {
      nav: { display: "none" },
      route: "/reports/posts/:id",
      mount: clientRef("./src/admin/pages.ts#mountPost"),
    },
  },
  adminBar: {
    position: "bottom-center",
    items: {
      // A link whose `href` the server resolves for each page.
      analytics: {
        label: "Analytics",
        icon: "chart-bar",
        order: 40,
        load: ({ url }) => ({
          href: `https://analytics.example.com/report?url=${encodeURIComponent(url)}`,
        }),
      },
      // A dropdown whose label and entries come from the CMS.
      "editor-shortcuts": {
        label: "Shortcuts",
        icon: "star",
        order: 50,
        load: async ({ user, cms }) => {
          const posts = await cms.find("posts", {
            where: { featured: true },
            limit: 5,
            populate: false,
            select: { title: true },
          });
          return {
            label: `${user.name}'s shortcuts`,
            children: Object.fromEntries(
              posts.map((post) => [
                `post-${post.id}`,
                { label: post.title, href: `/admin/reports/posts/${encodeURIComponent(post.id)}` },
              ]),
            ),
          };
        },
      },
      // A button. `load` gives the handler its data as `ctx.data`.
      hello: {
        label: "Say hello",
        icon: "air-vent",
        order: 60,
        onClick: clientRef("./src/admin/bar.ts#sayHello"),
        load: async ({ user, cms }) => ({
          editor: user.name,
          posts: (await cms.find("posts", { limit: 100, populate: false, select: { title: true } }))
            .length,
        }),
      },
      "add-to": {
        label: "add to",
        icon: "air-vent",
        order: 70,
        children: {
          cart: {
            label: "cart",
            icon: "shopping-cart",
            order: 1,
            onClick: clientRef("./src/admin/bar.ts#addToCart"),
          },
          checkout: {
            label: "checkout",
            icon: "dollar-sign",
            order: 2,
            onClick: clientRef("./src/admin/bar.ts#goToCheckout"),
          },
        },
      },
      // A custom control with plain DOM, in the bar's shadow root.
      "perspective-badge": {
        label: "Perspective",
        order: 35,
        mount: clientRef("./src/admin/bar.ts#mountPerspectiveBadge"),
      },
    },
  },
} satisfies AdminOptions;

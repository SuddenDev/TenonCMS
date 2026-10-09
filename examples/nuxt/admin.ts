import { clientRef, type AdminOptions } from "integral-cms/admin";

export const admin = {
  fields: { color: { mount: clientRef("./app/admin/index.ts#mountColor") } },
  pages: {
    stats: {
      title: "Stats",
      nav: { icon: "chart-bar" },
      mount: clientRef("./app/admin/index.ts#mountStats"),
    },
    post: {
      route: "/reports/posts/:id",
      nav: { display: "none" },
      mount: clientRef("./app/admin/index.ts#mountPostReport"),
    },
    dashboard: {
      title: "Dashboard",
      nav: { display: "main", order: 1 },
      route: "/",
      mount: clientRef("./app/admin/index.ts#mountDashboard"),
    },
  },
} satisfies AdminOptions;

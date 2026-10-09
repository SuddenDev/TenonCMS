import { clientRef, type AdminOptions } from "integral-cms/admin";

export const admin = {
  fields: { color: { mount: clientRef("./src/admin/index.tsx#mountColor") } },
  pages: {
    stats: {
      title: "Stats",
      nav: { icon: "chart-bar" },
      route: "/reports/stats",
      pageHeader: false,
      mount: clientRef("./src/admin/index.tsx#mountStats"),
    },
    post: {
      route: "/reports/posts/:id",
      nav: { display: "none" },
      mount: clientRef("./src/admin/index.tsx#mountPostReport"),
    },
  },
} satisfies AdminOptions;

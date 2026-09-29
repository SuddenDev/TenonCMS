import { defineAdmin } from "integral-cms/admin";
import { renderReact } from "integral-cms/admin/react";
import { ColorInput, PostReport, Stats } from "./src/admin";

export default defineAdmin({
  fields: { color: renderReact(ColorInput) },
  pages: {
    stats: {
      label: "Stats",
      nav: { icon: "chart-bar" },
      route: "/reports/stats",
      mount: renderReact(Stats),
    },
    post: {
      route: "/reports/posts/:id",
      nav: { display: "none" },
      mount: renderReact(PostReport),
    },
  },
});

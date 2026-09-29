import { defineAdmin } from "integral-cms/admin";
import { renderVue } from "integral-cms/admin/vue";
import ColorInput from "./app/components/ColorInput.vue";
import PostReport from "./app/components/PostReport.vue";
import Stats from "./app/components/Stats.vue";
import DashboardTest from "./app/components/DashboardTest.vue";

export default defineAdmin({
  fields: { color: renderVue(ColorInput) },
  pages: {
    stats: { label: "Stats", nav: { icon: "chart-bar" }, mount: renderVue(Stats) },
    post: {
      route: "/reports/posts/:id",
      nav: { display: "none" },
      mount: renderVue(PostReport),
    },
    dashboard: {
      label: "Dashboard",
      nav: { icon: "layout-dashboard", order: 0 },
      route: "/",
      mount: renderVue(DashboardTest),
    },
  },
});

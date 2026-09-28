import { defineAdmin } from "integral-cms/admin";
import { renderVue } from "integral-cms/admin/vue";
import ColorInput from "./app/components/ColorInput.vue";
import PostReport from "./app/components/PostReport.vue";
import Stats from "./app/components/Stats.vue";
import DashboardTest from "./app/components/DashboardTest.vue";

export default defineAdmin({
  fields: { color: renderVue(ColorInput) },
  pages: {
    stats: { label: "Stats", mount: renderVue(Stats) },
    // No label: reachable from the Stats page, not the sidebar.
    post: { route: "/reports/posts/:id", mount: renderVue(PostReport) },
    dashboard: { label: "Dashboard", route: "/", mount: renderVue(DashboardTest) },
  },
});

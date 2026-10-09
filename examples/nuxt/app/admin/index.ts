import { renderVue } from "integral-cms/admin/vue";
import ColorInput from "../components/ColorInput.vue";
import DashboardTest from "../components/DashboardTest.vue";
import PostReport from "../components/PostReport.vue";
import Stats from "../components/Stats.vue";

// Browser exports. `admin.ts` names them with `clientRef()`; the server config never imports this file.
export const mountColor = renderVue(ColorInput);
export const mountStats = renderVue(Stats);
export const mountPostReport = renderVue(PostReport);
export const mountDashboard = renderVue(DashboardTest);

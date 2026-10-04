import { useHead } from "@unhead/vue";
import { h } from "vue";
import { createRouter, createWebHistory, useRoute } from "vue-router";
import type { Page } from "../../core/src/admin/index.d.ts";
import Mount from "@/shared/components/Mount.vue";
import { pagePath } from "@/shared/options";
import CollectionList from "@/modules/documents/views/CollectionList.vue";
import DocEdit from "@/modules/documents/views/DocEdit.vue";
import GlobalEdit from "@/modules/documents/views/GlobalEdit.vue";
import Dashboard from "@/modules/dashboard/views/Dashboard.vue";
import Settings from "@/modules/settings/views/Settings.vue";
import Media from "@/modules/media/views/Media.vue";
import MediaFile from "@/modules/media/views/MediaFile.vue";
import Preview from "@/modules/preview/views/Preview.vue";

function hostPage({ mount, label }: Page, key: string) {
  return {
    setup() {
      useHead({ title: label ?? key });
      const route = useRoute();
      return () => h(Mount, { mount, ctx: { params: route.params, query: route.query } });
    },
  };
}

export function createAdminRouter(base: string, pages: Record<string, Page> = {}) {
  return createRouter({
    history: createWebHistory(`${base}/`),
    // Host pages come first. On an equal path the router keeps the first route, so they replace built-in views.
    routes: [
      ...Object.entries(pages).map(([key, p]) => ({
        path: pagePath(key, p),
        component: hostPage(p, key),
        meta: {
          breadcrumb: p.label ?? key,
          parent: p.nav?.display === "settings" ? "/settings" : undefined,
        },
      })),
      {
        path: "/settings",
        component: Settings,
        meta: { breadcrumb: "Settings", panes: true },
        children: [{ path: "globals/:name", component: GlobalEdit, meta: { panes: true } }],
      },
      { path: "/", component: Dashboard, meta: { breadcrumb: "Dashboard" } },
      {
        path: "/media/:folder(.*)?",
        component: Media,
        meta: {
          breadcrumb: (r) =>
            String(r.params.folder || "Media")
              .split("/")
              .at(-1)!,
        },
      },
      {
        path: "/media-file/:id",
        component: MediaFile,
        meta: { breadcrumb: "File", parent: "/media" },
      },
      // The media library is written only through the media API, so its generic views redirect.
      { path: "/collections/media", redirect: "/media" },
      { path: "/collections/media/:id", redirect: (to) => `/media-file/${String(to.params.id)}` },
      {
        path: "/collections/:name",
        component: CollectionList,
        meta: { panes: true },
        // The list stays mounted next to the open document.
        children: [{ path: ":id", component: DocEdit, meta: { panes: true } }],
      },
      { path: "/globals/:name", component: GlobalEdit, meta: { panes: true } },
      { path: "/presentation", component: Preview, meta: { panes: true, menu: false } },
      {
        path: "/presentation/collections/:name/:id",
        component: Preview,
        meta: { panes: true, menu: false },
      },
      {
        path: "/presentation/globals/:name",
        component: Preview,
        meta: { panes: true, menu: false },
      },
    ],
  });
}

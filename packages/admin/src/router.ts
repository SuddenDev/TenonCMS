import { useHead } from "@unhead/vue";
import { h } from "vue";
import { createRouter, createWebHistory, type RouteLocation, useRoute } from "vue-router";
import type { Page } from "../../core/src/admin/index.d.ts";
import Mount from "@/shared/components/Mount.vue";
import { schema } from "@/shared/api";
import { pagePath } from "@/shared/options";
import CollectionList from "@/modules/documents/views/CollectionList.vue";
import DocEdit from "@/modules/documents/views/DocEdit.vue";
import GlobalEdit from "@/modules/documents/views/GlobalEdit.vue";
import Dashboard from "@/modules/dashboard/views/Dashboard.vue";
import Settings from "@/modules/settings/views/Settings.vue";
import Media from "@/modules/media/views/Media.vue";
import MediaFile from "@/modules/media/views/MediaFile.vue";

function hostPage({ mount, label }: Page, key: string) {
  return {
    setup() {
      useHead({ title: label ?? key });
      const route = useRoute();
      return () => h(Mount, { mount, ctx: { params: route.params, query: route.query } });
    },
  };
}

function label(kind: "collections" | "globals", name: unknown) {
  return schema.value[kind]?.[String(name)]?.label ?? String(name);
}

// Items shown on the Settings page have it as their parent crumb.
function parent(kind: "collections" | "globals") {
  return (r: RouteLocation) =>
    schema.value[kind]?.[String(r.params.name)]?.nav?.display === "settings"
      ? "/settings"
      : undefined;
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
      { path: "/settings", component: Settings, meta: { breadcrumb: "Settings" } },
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
        meta: {
          breadcrumb: (r) => label("collections", r.params.name),
          parent: parent("collections"),
        },
      },
      {
        path: "/collections/:name/:id",
        component: DocEdit,
        meta: { breadcrumb: (r) => (r.params.id === "new" ? "New" : "Untitled") },
      },
      {
        path: "/globals/:name",
        component: GlobalEdit,
        meta: {
          breadcrumb: (r) => label("globals", r.params.name),
          parent: parent("globals"),
        },
      },
    ],
  });
}

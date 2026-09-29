import { useHead } from "@unhead/vue";
import { h } from "vue";
import { createRouter, createWebHistory, useRoute } from "vue-router";
import type { Page } from "../../core/src/admin/index.d.ts";
import Mount from "./components/Mount.vue";
import { pagePath } from "./lib/options";
import CollectionList from "./pages/CollectionList.vue";
import DocEdit from "./pages/DocEdit.vue";
import GlobalEdit from "./pages/GlobalEdit.vue";
import Home from "./pages/Home.vue";
import Media from "./pages/Media.vue";
import MediaFile from "./pages/MediaFile.vue";

function hostPage({ mount, menu }: Page) {
  return {
    setup() {
      useHead({ title: menu?.label });
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
        component: hostPage(p),
      })),
      { path: "/", component: Home },
      { path: "/media/:folder(.*)?", component: Media },
      { path: "/media-file/:id", component: MediaFile },
      // The media library is written only through the media API, so its generic views redirect.
      { path: "/collections/media", redirect: "/media" },
      { path: "/collections/media/:id", redirect: (to) => `/media-file/${String(to.params.id)}` },
      { path: "/collections/:name", component: CollectionList },
      { path: "/collections/:name/:id", component: DocEdit },
      { path: "/globals/:name", component: GlobalEdit },
    ],
  });
}

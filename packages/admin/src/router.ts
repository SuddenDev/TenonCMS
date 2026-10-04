import { useHead } from "@unhead/vue";
import { h } from "vue";
import { createRouter, createWebHistory, useRoute } from "vue-router";
import type { Page } from "../../core/src/admin/index.d.ts";
import NotFound from "@/shared/components/NotFound.vue";
import SelectContentPlaceholder from "@/shared/components/SelectContentPlaceholder.vue";
import Mount from "@/shared/components/Mount.vue";
import { CONTENT, pagePath } from "@/shared/options";
import CollectionList from "@/modules/documents/views/CollectionList.vue";
import DocEdit from "@/modules/documents/views/DocEdit.vue";
import GlobalEdit from "@/modules/documents/views/GlobalEdit.vue";
import Settings from "@/modules/settings/views/Settings.vue";
import Media from "@/modules/media/views/Media.vue";
import MediaFile from "@/modules/media/views/MediaFile.vue";
import Preview from "@/modules/preview/views/Preview.vue";

const empty = { render: () => null };
const placeholder = { render: () => h(SelectContentPlaceholder) };

function hostPage({ mount, title }: Page, key: string) {
  return {
    setup() {
      useHead({ title: title ?? key });
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
          breadcrumb: p.title ?? key,
          // Pages outside the content views rendered in full without the default content pane.
          full: p.nav?.display === "main" || p.nav?.display === "none",
          pageTitle: p.showPageTitle,
        },
      })),
      // A host page on `/` replaces the redirect.
      { path: "/", redirect: CONTENT },
      {
        path: CONTENT,
        component: placeholder,
        meta: { pageTitle: false, breadcrumb: "Content", root: true },
      },
      {
        path: `${CONTENT}/settings`,
        component: Settings,
        meta: { breadcrumb: "Settings", panes: true },
        children: [{ path: "globals/:name", component: GlobalEdit, meta: { panes: true } }],
      },
      {
        path: `${CONTENT}/media/:folder(.*)?`,
        component: Media,
        meta: {
          breadcrumb: (r) =>
            String(r.params.folder || "Media")
              .split("/")
              .at(-1)!,
        },
      },
      {
        path: `${CONTENT}/media-file/:id`,
        component: MediaFile,
        meta: { breadcrumb: "File", parent: `${CONTENT}/media` },
      },
      // The media library is written only through the media API, so its generic views redirect.
      { path: `${CONTENT}/collections/media`, redirect: `${CONTENT}/media` },
      {
        path: `${CONTENT}/collections/media/:id`,
        redirect: (to) => `${CONTENT}/media-file/${String(to.params.id)}`,
      },
      {
        path: `${CONTENT}/collections/:name`,
        component: CollectionList,
        meta: { panes: true },
        // The list stays mounted next to the open document.
        children: [{ path: ":id", component: DocEdit, meta: { panes: true } }],
      },
      { path: `${CONTENT}/globals/:name`, component: GlobalEdit, meta: { panes: true } },
      // Child routes keep the preview mounted while the document changes. `Preview` reads their params itself.
      {
        path: "/presentation",
        component: Preview,
        meta: { panes: true, menu: false },
        children: [
          { path: "collections/:name/:id", component: empty },
          { path: "globals/:name", component: empty },
        ],
      },
      // Last, so every real route wins.
      {
        path: "/:pathMatch(.*)*",
        component: NotFound,
        meta: { full: true, pageTitle: false },
      },
    ],
  });
}

import { useHead } from "@unhead/vue";
import { computed, h, inject, onUnmounted } from "vue";
import {
  createRouter,
  createWebHistory,
  useRoute,
  type Router,
  type RouteRecordRaw,
} from "vue-router";
import type { PageDescriptor } from "../../core/src/admin/index.d.ts";
import NotFound from "@/shared/components/NotFound.vue";
import SelectContentPlaceholder from "@/shared/components/SelectContentPlaceholder.vue";
import Mount from "@/shared/components/Mount.vue";
import { useExtensionData } from "@/shared/composables/useExtensionData";
import { i18n, text } from "@/shared/i18n";
import { CONTENT, pageDataKey, pagePath } from "@/shared/options";
import CollectionList from "@/modules/documents/views/CollectionList.vue";
import DocEdit from "@/modules/documents/views/DocEdit.vue";
import GlobalEdit from "@/modules/documents/views/GlobalEdit.vue";
import Settings from "@/modules/settings/views/Settings.vue";
import Media from "@/modules/media/views/Media.vue";
import MediaFile from "@/modules/media/views/MediaFile.vue";
import Preview from "@/modules/preview/views/Preview.vue";

const { t } = i18n.global;
const empty = { render: () => null };
const placeholder = { render: () => h(SelectContentPlaceholder) };

function hostPage({ mount, title, load }: PageDescriptor, key: string) {
  const name = `admin-page:${key}`;
  return {
    setup() {
      useHead({ title: () => text(title) ?? key });
      const route = useRoute();
      // A computed keeps the context object between renders of the router view, so `Mount` sees no change.
      if (!load) {
        const ctx = computed(() => ({ params: route.params, query: route.query }));
        return () => h(Mount, { mount, ctx: ctx.value });
      }

      // Only this route asks: while the view leaves, `route` already belongs to the next one.
      const data = useExtensionData(() =>
        route.name === name
          ? { kind: "page" as const, key, params: { ...route.params }, query: { ...route.query } }
          : undefined,
      );
      // The page header reads the same data.
      const shared = inject(pageDataKey, undefined);
      if (shared) {
        shared.value = data;
        onUnmounted(() => {
          if (shared.value === data) shared.value = undefined;
        });
      }
      // Params and query come from the request that produced the data, so they change together with it.
      const ctx = computed(() => {
        const { params, query } = data.result.value?.request ?? route;
        return { params, query };
      });
      return () => h(Mount, { mount, ctx: ctx.value, loader: data });
    },
  };
}

function pageRoute(key: string, page: PageDescriptor): RouteRecordRaw {
  return {
    name: `admin-page:${key}`,
    path: pagePath(key, page),
    component: hostPage(page, key),
    meta: {
      breadcrumb: () => text(page.title) ?? key,
      full: page.nav?.display === "main" || page.nav?.display === "none",
      pageHeader: page.pageHeader,
      page: key,
      load: page.load,
    },
  };
}

export async function addAdminPages(router: Router, pages: Record<string, PageDescriptor> = {}) {
  for (const [key, page] of Object.entries(pages)) {
    const path = pagePath(key, page);
    for (const route of router.getRoutes())
      if (route.path === path && route.name) router.removeRoute(route.name);
    router.addRoute(pageRoute(key, page));
  }
  if (Object.keys(pages).length) {
    await router.isReady();
    const route = router.currentRoute.value;
    await router.replace(route.redirectedFrom?.fullPath ?? route.fullPath);
  }
}

export function createAdminRouter(base: string) {
  const routes: RouteRecordRaw[] = [
    { path: "/", redirect: CONTENT },
    {
      path: CONTENT,
      component: placeholder,
      meta: { pageHeader: false, breadcrumb: () => t("nav.content"), root: true },
    },
    {
      path: `${CONTENT}/settings`,
      component: Settings,
      meta: { breadcrumb: () => t("nav.settings"), panes: true },
      children: [{ path: "globals/:name", component: GlobalEdit, meta: { panes: true } }],
    },
    {
      path: `${CONTENT}/media/:folder(.*)?`,
      component: Media,
      meta: {
        breadcrumb: (r) =>
          String(r.params.folder || t("nav.media"))
            .split("/")
            .at(-1)!,
      },
    },
    {
      path: `${CONTENT}/media-file/:id`,
      component: MediaFile,
      meta: { breadcrumb: () => t("nav.file"), parent: `${CONTENT}/media` },
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
      meta: { full: true, pageHeader: false },
    },
  ];
  return createRouter({
    history: createWebHistory(`${base}/`),
    routes: routes.map((route) => ({ ...route, name: route.name ?? `builtin:${route.path}` })),
  });
}

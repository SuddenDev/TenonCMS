<script setup lang="ts">
import { computed, inject, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";
import type {
  ClientRef,
  Crumb,
  Mount as MountFn,
  PageHeader,
} from "../../../../../core/src/admin/index.d.ts";
import { loadClientRef } from "../../../../../core/src/admin/browser/lazy-mount.ts";
import AppBreadcrumbs from "@/shared/components/navigation/AppBreadcrumbs.vue";
import Mount from "@/shared/components/Mount.vue";
import { useBreadcrumbs } from "@/shared/composables/useBreadcrumbs";
import { integralKey, pageDataKey, registryKey } from "@/shared/options";

// `true`: the breadcrumbs, `false`: nothing, an array: these breadcrumbs, a `clientRef`: a callback that returns either.
const props = defineProps<{ value: boolean | Crumb[] | ClientRef<PageHeader<any>> }>();
const route = useRoute();
const trail = useBreadcrumbs();
const integral = inject(integralKey)!;
const registry = inject(registryKey, {});
const pageData = inject(pageDataKey, undefined);

const header = shallowRef<PageHeader<any>>();
const reference = computed(() =>
  typeof props.value === "object" && !Array.isArray(props.value) ? props.value : undefined,
);
watch(
  reference,
  (ref) => {
    header.value = undefined;
    if (ref)
      loadClientRef(ref, registry).then(
        (fn) => {
          if (reference.value === ref) header.value = fn;
        },
        (error) => console.error(error),
      );
  },
  { immediate: true },
);

// The callback gets the context of the page: with a server loader, the params, query and data of the last
// finished load. Until that exists, and without the callback, the default breadcrumbs show.
const context = computed(() => {
  if (!route.meta.load)
    return { params: route.params, query: route.query, data: undefined, integral };
  const loader = pageData?.value;
  const loaded = loader?.result.value;
  if (!loader || !loaded || loaded.request.key !== route.meta.page) return undefined;
  return {
    params: loaded.request.params,
    query: loaded.request.query,
    data: loaded.data,
    integral: { ...integral, reload: async () => void (await loader.reload()) },
  };
});

// A string is HTML, anything else is a list of crumbs.
const shown = computed(() => {
  if (Array.isArray(props.value)) return props.value;
  const ctx = context.value;
  if (!header.value || !ctx) return trail.value;
  try {
    return header.value(
      trail.value.map((c) => ({ ...c })),
      ctx as never,
    );
  } catch (error) {
    console.error(error);
    return trail.value;
  }
});

// `Mount` also opens links under the admin path without a reload.
const renderHtml: MountFn<{ html: string }> = (el, { html }) => {
  el.innerHTML = html;
  return { update: (ctx) => (el.innerHTML = ctx.html), unmount: () => (el.innerHTML = "") };
};
</script>

<template>
  <Mount
    v-if="typeof shown === 'string'"
    :mount="renderHtml"
    :ctx="{ html: shown }"
    class="w-full min-w-0"
  />
  <AppBreadcrumbs v-else-if="value !== false" :crumbs="shown" />
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { useRoute } from "vue-router";
import type { Mount as MountFn, Page } from "../../../../../core/src/admin/index.d.ts";
import AppBreadcrumbs from "@/shared/components/navigation/AppBreadcrumbs.vue";
import Mount from "@/shared/components/Mount.vue";
import { useBreadcrumbs } from "@/shared/composables/useBreadcrumbs";
import { integralKey } from "@/shared/options";

const props = defineProps<{ value: NonNullable<Page["showPageTitle"]> }>();
const route = useRoute();
const trail = useBreadcrumbs();
const integral = inject(integralKey)!;

// A string is HTML, anything else is a list of crumbs.
const shown = computed(() => {
  if (Array.isArray(props.value)) return props.value;
  if (typeof props.value !== "function") return trail.value;
  return props.value(
    trail.value.map((c) => ({ ...c })),
    { params: route.params, query: route.query, integral },
  );
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

<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ClientRef, Mount, MountHandle } from "../../../../core/src/admin/index.d.ts";
import { lazyMount, loadClientRef } from "../../../../core/src/admin/browser/lazy-mount.ts";
import { Button } from "@/shared/components/ui/button";
import type { ExtensionData } from "@/shared/composables/useExtensionData";
import { integralKey, registryKey } from "@/shared/options";

// `loader`: the server data of the registration. The first mount waits for the browser code and the data.
// The context gets `data` and a `reload` of this extension only. Without a loader, `data` is undefined.
const props = defineProps<{
  mount: Mount<any> | ClientRef<Mount<any>>;
  ctx: Record<string, unknown>;
  loader?: ExtensionData<any>;
  elClass?: string;
}>();
const { t, locale } = useI18n();
const el = useTemplateRef("el");
const registry = inject(registryKey, {});
const integral = inject(integralKey)!;
let handle: MountHandle<unknown> | undefined;
// The mount function ran, or the browser code failed to load.
const started = ref(false);

const context = () => ({
  ...props.ctx,
  data: props.loader?.result.value?.data,
  integral: {
    ...integral,
    locale: locale.value,
    reload: async () => {
      await props.loader?.reload();
    },
  },
});

onMounted(() => {
  const loader = props.loader;
  let open: () => void = () => {};
  const gate = loader && new Promise<void>((resolve) => (open = resolve));
  if (loader?.result.value) open();
  const mount =
    typeof props.mount === "function" && !loader
      ? props.mount
      : lazyMount(async () => {
          try {
            const code =
              typeof props.mount === "function"
                ? props.mount
                : await loadClientRef(props.mount, registry);
            return ((el, ctx) => {
              started.value = true;
              return code(el, ctx);
            }) as Mount<unknown>;
          } catch (error) {
            started.value = true;
            throw error;
          }
        }, gate);
  const r = mount(el.value!, context());
  handle = typeof r === "function" ? { unmount: r } : r;
  // Updates reach `lazyMount` before the gate opens, so the first mount gets the settled context.
  // After the render, so a change of `ctx` and of the data in one flush arrive as one update.
  watch(
    context,
    (ctx) => {
      handle?.update?.(ctx);
      if (loader?.result.value) open();
    },
    { deep: true, flush: "post" },
  );
});
onUnmounted(() => handle?.unmount());

// Host links under the admin path open in the admin without a reload, like RouterLink.
// Everything a browser handles on its own stays a normal link: other origins, `target`, `download`,
// modifier keys, other buttons, and clicks the host already handled.
function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const a = (e.target as Element).closest("a[href]");
  if (!a || a.hasAttribute("download") || (a.getAttribute("target") ?? "_self") !== "_self") return;
  const url = new URL(a.getAttribute("href")!, location.href);
  const { base } = integral;
  if (
    url.origin !== location.origin ||
    (url.pathname !== base && !url.pathname.startsWith(`${base}/`))
  )
    return;
  e.preventDefault();
  integral.navigate((url.pathname.slice(base.length) || "/") + url.search + url.hash);
}
</script>

<template>
  <div
    class="flex h-full w-full flex-col"
    :aria-busy="loader?.loading.value || undefined"
    @click="onClick"
  >
    <p
      v-if="loader && !started && !loader.error.value"
      role="status"
      class="text-muted-foreground p-4 text-sm"
    >
      {{ t("common.loading") }}
    </p>
    <div
      v-if="loader?.error.value"
      role="alert"
      class="text-destructive flex items-center gap-3 p-4 text-sm"
    >
      <span>{{ loader.error.value.message }}</span>
      <Button type="button" variant="outline" size="sm" @click="loader.reload()">{{
        t("common.retry")
      }}</Button>
    </div>
    <div ref="el" :class="['min-h-0 w-full flex-1', elClass]" />
  </div>
</template>

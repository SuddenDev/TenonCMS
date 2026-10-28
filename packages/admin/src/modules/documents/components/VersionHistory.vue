<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Fields, Layout, Version, VersionWithData } from "@/shared/api";
import { ago } from "@/shared/utils";
import { changedKeys, groupByTime } from "@/modules/documents/versions";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/shared/components/ui/item";
import DocForm from "./DocForm.vue";

// The history of a document or global in the active language. A version opens in the form, read-only, with the
// fields it changed against the version before it marked.
// `drafts`: a restore becomes the draft. Without drafts it saves at once.
// `canRestore`: the user MAY write now. It is false in the Published view and while someone else holds the lock.
const props = defineProps<{
  fields: Fields;
  layout?: Layout;
  list: () => Promise<Version[]>;
  get: (id: string) => Promise<VersionWithData>;
  restore: (id: string) => Promise<void>;
  drafts: boolean;
  canRestore: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();

const versions = ref<Version[]>([]);
const groups = computed(() => groupByTime(versions.value));
const open = ref<VersionWithData>();
// `undefined` for the first version, which has nothing to compare with.
const changed = ref<string[]>();
const busy = ref(false);
const error = ref("");

const dot =
  "size-2 shrink-0 rounded-full data-[status=published]:bg-emerald-500 data-[status=draft]:bg-amber-500";
const header =
  "mx-auto w-full max-w-2xl px-6 pt-6 pb-8 group-data-[expanded=true]/pane:max-w-none sm:px-8";
const byline = (v: Version) =>
  t("versions.byline", {
    name: v.user ? v.user.name || t("documents.someone") : t("versions.server"),
    ago: ago(v.updatedAt, locale.value),
  });

async function attempt(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

attempt(async () => {
  versions.value = await props.list();
});

// The list is newest first, so the version before is the next entry.
const show = (id: string) =>
  attempt(async () => {
    const before = versions.value[versions.value.findIndex((v) => v.id === id) + 1];
    const [version, previous] = await Promise.all([props.get(id), before && props.get(before.id)]);
    changed.value = previous && changedKeys(props.fields, previous.data, version.data);
    open.value = version;
  });

const restore = () => attempt(() => props.restore(open.value!.id));
</script>

<template>
  <div class="flex min-h-full flex-col">
    <template v-if="open">
      <header :class="header">
        <Button type="button" variant="ghost" size="sm" class="-ml-3" @click="open = undefined">
          <Icon name="arrow-left" />{{ t("documents.history") }}
        </Button>
        <h1 class="mt-4 flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <span :class="dot" :data-status="open.status" aria-hidden="true" />
          {{ t(open.status === "draft" ? "versions.draft" : "versions.published") }}
        </h1>
        <p class="text-muted-foreground mt-2 text-sm">
          {{ byline(open) }} ·
          {{ changed ? t("versions.changes", changed.length) : t("versions.first") }}
        </p>
      </header>
      <DocForm
        class="flex-1"
        :fields="fields"
        :layout="layout"
        :initial="open.data"
        :changed="changed"
        inert
      />
    </template>
    <template v-else>
      <header :class="header">
        <Button type="button" variant="ghost" size="sm" class="-ml-3" @click="emit('close')">
          <Icon name="arrow-left" />{{ t("versions.back") }}
        </Button>
        <h1 class="mt-4 text-3xl font-semibold tracking-tight">{{ t("documents.history") }}</h1>
      </header>
      <div
        class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pb-12 group-data-[expanded=true]/pane:max-w-none sm:px-8"
      >
        <section v-for="g in groups" :key="g.group">
          <h2 class="text-muted-foreground mb-1 px-3 text-xs font-medium">
            {{ t(`versions.groups.${g.group}`) }}
          </h2>
          <ItemGroup class="gap-1">
            <Item
              v-for="v in g.items"
              :key="v.id"
              as="button"
              type="button"
              size="sm"
              class="hover:bg-muted text-left"
              :disabled="busy"
              @click="show(v.id)"
            >
              <span :class="dot" :data-status="v.status" aria-hidden="true" />
              <ItemContent>
                <ItemTitle>{{
                  t(v.status === "draft" ? "versions.draft" : "versions.published")
                }}</ItemTitle>
                <ItemDescription>{{ byline(v) }}</ItemDescription>
              </ItemContent>
              <Icon name="chevron-right" class="text-muted-foreground" />
            </Item>
          </ItemGroup>
        </section>
        <p v-if="!busy && !versions.length" class="text-muted-foreground text-sm">
          {{ t("versions.empty") }}
        </p>
      </div>
    </template>
    <footer
      v-if="open || error"
      class="bg-background border-border sticky bottom-0 z-10 mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3"
    >
      <span v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</span>
      <span v-else-if="canRestore" class="text-muted-foreground text-sm">
        {{ t(drafts ? "versions.restoreDraft" : "versions.restoreSave") }}
      </span>
      <Button
        v-if="open"
        type="button"
        size="sm"
        class="ml-auto"
        :disabled="busy || !canRestore"
        @click="restore"
      >
        <Icon name="history" />{{ t("versions.restore") }}
      </Button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client, schema } from "@/shared/api";
import { text } from "@/shared/i18n";
import { useLocale } from "@/shared/composables/useLocale";
import type { LinkTargets } from "../../../../../../core/src/links/config/types";
import { linkHost, urlFromText } from "@/modules/documents/links";
import { injectLinks } from "@/modules/documents/composables/useLinks";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxViewport,
} from "@/shared/components/ui/combobox";

// One combobox: typing searches link targets by title, and text that looks like a URL offers to use it.
const props = defineProps<FieldProps<"link">>();
const model = defineModel<any>();
const { t } = useI18n();
const { locale } = useLocale();
const links = injectLinks();

const query = ref("");
const groups = ref<LinkTargets>([]);
const loading = ref(false);
const url = computed(() => urlFromText(query.value));
let timer: ReturnType<typeof setTimeout> | undefined;
let requests = 0;

const resolved = computed(() =>
  model.value?.reference ? links.resolve(model.value.reference) : undefined,
);
const collectionLabel = (name: string) => text(schema.value.collections?.[name]?.label) ?? name;
const broken = computed(() => !!model.value?.reference?.deleted || !!resolved.value?.broken);

function search() {
  clearTimeout(timer);
  const request = ++requests;
  loading.value = true;

  timer = setTimeout(async () => {
    try {
      const found = await client.links.search({ query: query.value, locale: locale.value });
      if (request === requests) groups.value = found.filter((group) => group.items.length);
    } catch {
      if (request === requests) groups.value = [];
    } finally {
      if (request === requests) loading.value = false;
    }
  }, 200);
}

watch(query, search);
onBeforeUnmount(() => {
  requests++;
  clearTimeout(timer);
});

const target = () => (model.value?.target ? { target: model.value.target } : {});

function pick(value: unknown) {
  if (typeof value !== "string") return;

  const [kind, a, b] = JSON.parse(value) as [string, string, string?];
  if (kind === "url") model.value = { href: a, ...target() };
  else {
    const reference = { collection: a, id: b! };
    const label = groups.value
      .find((g) => g.collection === a)
      ?.items.find((i) => i.id === b)?.label;
    if (label) links.remember(reference, label);
    model.value = { reference, ...target() };
  }
  query.value = "";
}

function setNewTab(on: boolean) {
  const { target: _, ...rest } = model.value;
  model.value = on ? { ...rest, target: "_blank" } : rest;
}
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, required, invalid }">
    <div class="flex flex-col gap-3">
      <div
        v-if="model"
        :id="id"
        :aria-invalid="invalid"
        class="border-input dark:bg-input/30 aria-invalid:border-destructive flex min-h-9 items-center gap-2 rounded-md border py-1.5 pr-1 pl-3 shadow-xs"
      >
        <Icon
          :name="model.reference ? 'file-text' : 'link'"
          class="text-muted-foreground shrink-0"
        />
        <div class="flex min-w-0 flex-1 flex-col">
          <template v-if="model.reference">
            <span v-if="broken" class="text-destructive truncate text-sm">{{
              t("links.broken")
            }}</span>
            <span v-else class="truncate text-sm">{{ resolved?.title ?? model.reference.id }}</span>
            <span v-if="resolved?.href" class="text-muted-foreground truncate text-xs">
              {{ resolved.href }}
            </span>
          </template>
          <span v-else class="truncate text-sm" :title="model.href">{{ model.href }}</span>
        </div>
        <span
          v-if="model.reference"
          class="bg-muted text-muted-foreground shrink-0 rounded-sm px-1.5 py-0.5 text-xs"
        >
          {{ collectionLabel(model.reference.collection) }}
        </span>
        <span
          v-else-if="linkHost(model.href) !== model.href"
          class="bg-muted text-muted-foreground shrink-0 rounded-sm px-1.5 py-0.5 text-xs"
        >
          {{ linkHost(model.href) }}
        </span>
        <Button
          v-if="!field.readOnly"
          type="button"
          variant="ghost"
          size="icon-sm"
          :aria-label="t('common.clear')"
          @click="model = null"
        >
          <Icon name="x" />
        </Button>
      </div>
      <Combobox
        v-else
        ignore-filter
        open-on-focus
        open-on-click
        :disabled="field.readOnly"
        @update:model-value="pick"
        @update:open="(open: boolean) => open && search()"
      >
        <ComboboxAnchor class="w-full">
          <ComboboxInput
            :id="id"
            v-model="query"
            :aria-invalid="invalid"
            :disabled="field.readOnly"
            :placeholder="t('links.search')"
          />
        </ComboboxAnchor>
        <ComboboxList>
          <ComboboxViewport>
            <ComboboxEmpty v-if="!url">
              {{ t(loading ? "common.loading" : "common.noMatches") }}
            </ComboboxEmpty>
            <ComboboxItem v-if="url" :value="JSON.stringify(['url', url])">
              <Icon name="link" />
              <span class="truncate">{{ t("links.use", { url }) }}</span>
            </ComboboxItem>
            <ComboboxGroup
              v-for="group in groups"
              :key="group.collection"
              :heading="text(group.label)"
            >
              <ComboboxItem
                v-for="item in group.items"
                :key="item.id"
                :value="JSON.stringify(['reference', group.collection, item.id])"
              >
                {{ item.label }}
              </ComboboxItem>
            </ComboboxGroup>
          </ComboboxViewport>
        </ComboboxList>
      </Combobox>
      <!-- Lets the browser's form check enforce `required`, which the combobox cannot. -->
      <input
        v-if="required && !model"
        value=""
        required
        tabindex="-1"
        aria-hidden="true"
        class="sr-only"
      />
      <label class="flex items-center gap-2 text-sm">
        <Switch
          size="sm"
          :model-value="model?.target === '_blank'"
          :disabled="!model || field.readOnly"
          @update:model-value="setNewTab"
        />
        {{ t("links.newTab") }}
      </label>
    </div>
  </FieldFrame>
</template>

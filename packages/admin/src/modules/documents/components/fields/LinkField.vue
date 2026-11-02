<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client, schema } from "@/shared/api";
import { text } from "@/shared/i18n";
import { useLocale } from "@/shared/composables/useLocale";
import type { LinkTargets } from "../../../../../../core/src/links/config/types";
import { linkHost, urlFromText } from "@/modules/documents/links";
import { isLinkSuffix } from "../../../../../../core/src/links/runtime/url";
import { injectLinks } from "@/modules/documents/composables/useLinks";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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

// The suffix input shows while a suffix exists or until it is left empty. Clearing the text must not close it.
const open = ref(false);
const suffixInput = ref<{ $el: HTMLInputElement }>();
const path = computed(() => (model.value?.reference ? resolved.value?.href : model.value?.href));
const showSuffix = computed(() => !!path.value && open.value);

// Long values scroll to their end, so the end of a link stays visible.
function showEnd() {
  const el = suffixInput.value?.$el;
  if (el) el.scrollLeft = el.scrollWidth;
}

watch(
  () => model.value?.suffix,
  (suffix) => suffix && (open.value = true),
  { immediate: true },
);
watch(model, (value) => value || (open.value = false));

async function addSuffix() {
  open.value = true;
  await nextTick();
  suffixInput.value?.$el.focus();
}

function setSuffix(value: string | number) {
  const { suffix: _, ...rest } = model.value;
  model.value = value ? { ...rest, suffix: String(value) } : rest;
}

function leaveSuffix() {
  if (!model.value?.suffix) open.value = false;
  showEnd();
}

function clearSuffix() {
  setSuffix("");
  open.value = false;
}

onMounted(() => nextTick(showEnd));

function setNewTab(on: boolean) {
  const { target: _, ...rest } = model.value;
  model.value = on ? { ...rest, target: "_blank" } : rest;
}
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, required, invalid }">
    <div class="group/field flex flex-col gap-3">
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
          </template>
          <div
            v-if="path"
            class="flex min-w-0 items-center gap-1"
            :class="model.reference ? 'text-muted-foreground text-xs' : 'text-sm'"
          >
            <!-- rtl with an ltr island keeps the end of a long path visible. -->
            <span class="min-w-0 truncate text-left" dir="rtl" :title="path">
              <bdo dir="ltr">{{ path }}</bdo>
            </span>
            <div
              v-if="showSuffix"
              class="group/suffix bg-muted has-aria-invalid:bg-destructive/15 focus-within:ring-ring/50 has-aria-invalid:focus-within:ring-destructive/30 flex h-6 max-w-[80%] min-w-0 shrink cursor-text items-center gap-2 rounded-sm pl-2 focus-within:ring-2"
              @click="suffixInput?.$el.focus()"
            >
              <Input
                ref="suffixInput"
                :model-value="model.suffix ?? ''"
                :disabled="field.readOnly"
                :aria-invalid="!!model.suffix && !isLinkSuffix(model.suffix)"
                :aria-label="t('links.suffix')"
                :title="model.suffix"
                :placeholder="t('links.suffixPlaceholder')"
                :class="[
                  'field-sizing-content h-full w-auto min-w-0 shrink rounded-none border-0 bg-transparent px-0 py-0 shadow-none placeholder-shown:min-w-40 focus:min-w-40 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent',
                  model.reference ? 'text-xs md:text-xs' : 'text-sm md:text-sm',
                ]"
                @update:model-value="setSuffix"
                @blur="leaveSuffix"
                @keydown.enter.prevent="suffixInput?.$el.blur()"
              />
              <template v-if="!field.readOnly">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  class="text-muted-foreground opacity-0 group-hover/suffix:opacity-100"
                  :aria-label="t('common.clear')"
                  @mousedown.prevent
                  @click="clearSuffix"
                >
                  <Icon name="x" />
                </Button>
              </template>
            </div>
            <Button
              v-else-if="!field.readOnly"
              type="button"
              variant="outline"
              size="xs"
              :class="[
                'border-foreground/20! bg-background text-muted-foreground h-6 rounded-sm pr-2 pl-1 opacity-0 group-hover/field:opacity-100',
                model.reference ? 'text-xs' : 'text-sm',
              ]"
              @click="addSuffix"
            >
              <Icon name="plus" />{{ t("links.addSuffix") }}
            </Button>
          </div>
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

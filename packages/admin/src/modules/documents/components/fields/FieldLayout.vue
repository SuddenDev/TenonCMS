<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { Field, Fields, Layout } from "@/shared/api";
import { text } from "@/shared/i18n";
import { focusKey } from "@/modules/documents/fields";
import { layout as arrange, type Section } from "@/modules/documents/layout";
import FieldSection from "./FieldSection.vue";
import Icon from "@/shared/components/Icon.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

// Places fields by the `tabs` and `fieldsets` of their owner and their own `width`. The caller renders each field.
// `show`: whether a field applies now. `path`: dot path of the owner in `errors` and `focusKey`, empty at the top.
// `split`: groups and lists occupy their own section at the top level.
const props = withDefaults(
  defineProps<{
    fields: Fields;
    layout?: Layout;
    show?: (name: string, field: Field) => boolean;
    path?: string;
    errors?: Record<string, string>;
    split?: boolean;
  }>(),
  { layout: () => ({}), show: () => true, path: "", errors: () => ({}) },
);
defineSlots<{
  field(props: { name: string; field: Field }): any;
}>();
const { t } = useI18n();

const arranged = computed(() => arrange(props.fields, props.layout, props.split));
const prefix = computed(() => (props.path ? `${props.path}.` : ""));
const visible = (section: Section) => section.fields.filter(([n, f]) => props.show(n, f));
const holds = (sections: Section[], name: string) =>
  sections.some((s) => s.fields.some(([n]) => n === name));

// A tab or box with an error in it is marked, and a closed box opens for it.
const failed = (section: Section) =>
  Object.keys(props.errors).some((key) =>
    section.fields.some(
      ([n]) => key === prefix.value + n || key.startsWith(`${prefix.value + n}.`),
    ),
  );

// A field to focus in another tab switches to it.
const tab = ref(arranged.value.tabs[0]?.key);
const focus = inject(focusKey, undefined);
watch(
  () => focus?.value,
  (target) => {
    if (!target?.startsWith(prefix.value)) return;
    const name = target.slice(prefix.value.length).split(".")[0];
    const holder = arranged.value.tabs.find((x) => holds(x.sections, name));
    if (holder && !holds(arranged.value.head, name)) tab.value = holder.key;
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex min-w-0 flex-col gap-8">
    <template v-for="(section, i) in arranged.head" :key="i">
      <FieldSection
        v-if="visible(section).length"
        :section="section"
        :fields="visible(section)"
        :layout="layout"
        :failed="failed(section)"
      >
        <template #field="p"><slot name="field" v-bind="p" /></template>
      </FieldSection>
    </template>
    <Tabs v-if="arranged.tabs.length" v-model="tab" class="min-w-0 gap-4">
      <div class="min-w-0 overflow-x-auto">
        <TabsList>
          <TabsTrigger v-for="x in arranged.tabs" :key="x.key" :value="x.key">
            <Icon v-if="layout.tabs?.[x.key]?.icon" :name="layout.tabs[x.key].icon!" />
            {{ text(layout.tabs?.[x.key]?.label) ?? x.key }}
            <span
              v-if="x.sections.some(failed)"
              class="bg-destructive size-1.5 rounded-full"
              role="img"
              :aria-label="t('documents.hasErrors')"
            />
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent
        v-for="x in arranged.tabs"
        :key="x.key"
        :value="x.key"
        class="flex min-w-0 flex-col gap-8"
      >
        <template v-for="(section, i) in x.sections" :key="i">
          <FieldSection
            v-if="visible(section).length"
            :section="section"
            :fields="visible(section)"
            :layout="layout"
            :failed="failed(section)"
          >
            <template #field="p"><slot name="field" v-bind="p" /></template>
          </FieldSection>
        </template>
      </TabsContent>
    </Tabs>
  </div>
</template>

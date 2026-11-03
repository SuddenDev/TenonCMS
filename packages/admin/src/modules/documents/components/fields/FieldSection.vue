<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { Field, Layout } from "@/shared/api";
import { text } from "@/shared/i18n";
import type { Section } from "@/modules/documents/layout";
import Icon from "@/shared/components/Icon.vue";
import FieldSeparator from "./FieldSeparator.vue";
import { FieldSet, FieldDescription } from "@/shared/components/ui/field";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";

const props = defineProps<{
  section: Section;
  fields: [string, Field][];
  layout: Layout;
  failed?: boolean;
}>();
defineSlots<{
  field(props: { name: string; field: Field }): any;
}>();

const box = computed(() =>
  props.section.fieldset ? props.layout.fieldsets?.[props.section.fieldset] : undefined,
);
const opened = ref(!box.value?.collapsed);
const id = useId();

// The narrow form stacks every field. Literal classes, so Tailwind finds them.
const widths: Record<string, string> = {
  "1/4": "@md:col-span-3",
  "1/3": "@md:col-span-4",
  "1/2": "@md:col-span-6",
  "2/3": "@md:col-span-8",
  "3/4": "@md:col-span-9",
};
</script>

<template>
  <Collapsible
    v-if="section.fieldset"
    v-slot="{ open }"
    :open="opened || failed"
    :disabled="!box?.collapsible"
    class="border-border overflow-hidden rounded-lg border"
    @update:open="(v) => (opened = v)"
  >
    <FieldSet :aria-labelledby="id" class="min-w-0 gap-0">
      <div class="">
        <CollapsibleTrigger
          v-if="box?.collapsible"
          :id="id"
          class="hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2"
        >
          <div class="w-full">
            <span class="flex-1">{{ text(box.label) ?? section.fieldset }}</span>
            <FieldDescription v-if="box?.description" class="mt-1">{{
              text(box.description)
            }}</FieldDescription>
          </div>
          <Icon
            name="chevron-down"
            class="text-muted-foreground size-4"
            :class="!open && '-rotate-90'"
          />
        </CollapsibleTrigger>
        <div v-else :id="id" class="px-4 py-3 text-sm font-medium">
          {{ text(box?.label) ?? section.fieldset }}
        </div>
      </div>
      <CollapsibleContent class="border-border border-t px-4 py-3">
        <div class="@container">
          <div class="grid grid-cols-12 gap-x-6 gap-y-8">
            <template v-for="[name, field] in fields" :key="name">
              <FieldSeparator v-if="field.separator" :separator="field.separator" />
              <div class="col-span-12 min-w-0" :class="widths[field.width ?? 'full']">
                <slot name="field" v-bind="{ name, field }" />
              </div>
            </template>
          </div>
        </div>
      </CollapsibleContent>
    </FieldSet>
  </Collapsible>
  <div v-else class="@container">
    <div class="grid grid-cols-12 gap-x-6 gap-y-8">
      <template v-for="[name, field] in fields" :key="name">
        <FieldSeparator v-if="field.separator" :separator="field.separator" />
        <div class="col-span-12 min-w-0" :class="widths[field.width ?? 'full']">
          <slot name="field" v-bind="{ name, field }" />
        </div>
      </template>
    </div>
  </div>
</template>

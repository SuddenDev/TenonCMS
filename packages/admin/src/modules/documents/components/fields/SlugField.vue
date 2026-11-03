<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client, schema, slugify, SLUG_PATTERN } from "@/shared/api";
import { ownerKey, titleField } from "@/modules/documents/fields";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { Button } from "@/shared/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/components/ui/input-group";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

const props = defineProps<FieldProps<"slug">>();
const model = defineModel<any>();
const { t } = useI18n();
// A new document's slug follows its `from` field until the editor edits the slug. Saved slugs never change, so URLs stay stable.
const edited = ref(false);
const slug = props.field;
if (slug.from) {
  const from = slug.from;
  watch(
    () => props.siblings.data[from],
    (text) => {
      if (props.isNew && !edited.value) model.value = slugify(String(text ?? ""));
    },
  );
}

// A pasted text becomes a slug as a whole, so the field never holds an invalid one.
function paste(event: ClipboardEvent) {
  event.preventDefault();
  const input = event.target as HTMLInputElement;
  const text = event.clipboardData?.getData("text") ?? "";
  const value = input.value;
  model.value = slugify(
    value.slice(0, input.selectionStart ?? value.length) +
      text +
      value.slice(input.selectionEnd ?? value.length),
  );
  edited.value = true;
}

// With `parent`, the prefix is the selected parent's path, e.g. `/about/`, and picks the parent.
const relation = slug.parent ? props.siblings.fields[slug.parent] : undefined;
const parent = relation?.type === "relation" ? slug.parent : undefined;
const locked = relation?.type === "relation" && !!relation.readOnly;
const owner = inject(ownerKey, undefined);
const open = ref(false);
const pages = ref<{ value: string; path: string; title: string }[]>([]);
if (parent && relation?.type === "relation") {
  const target = relation.collection;
  // shortcut: loads the target collection in full, like `RelationField`; add search and paging when collections grow.
  client.find(target, { populate: false }).then((docs) => {
    const collection = schema.value.collections?.[target];
    const key = collection ? titleField(collection) : "";
    pages.value = docs.map((d) => {
      const path = d[slug.path ?? "path"];
      return {
        value: d.id,
        path: typeof path === "string" ? path.replace(/\/$/, "") : "",
        title: String(d[key] || d.id),
      };
    });
  });
}
const parentId = computed(() => (parent ? props.siblings.data[parent] : undefined));
const prefix = computed(
  () => `${pages.value.find((p) => p.value === parentId.value)?.path ?? ""}/`,
);
// A page MUST NOT move below itself. The server's `validParent` hook enforces it, too.
const choices = computed(() => {
  const id = owner?.value && "id" in owner.value ? owner.value.id : undefined;
  const own = pages.value.find((p) => p.value === id)?.path;
  return pages.value.filter(
    (p) => p.value !== id && !(own && (p.path === own || p.path.startsWith(`${own}/`))),
  );
});
function pick(id: unknown) {
  if (parent) props.siblings.data[parent] = id || null;
  open.value = false;
}
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
    <!-- The anchor is the whole input, so the list opens below it. Nested `as-child` triggers lose the trigger element. -->
    <Popover v-model:open="open">
      <PopoverAnchor as-child>
        <InputGroup class="h-9 rounded-md">
          <InputGroupAddon class="ml-0.5 rounded-l-sm has-[>button]:ml-0.5">
            <Tooltip v-if="parent">
              <TooltipTrigger as-child>
                <PopoverTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    role="combobox"
                    :disabled="locked"
                    :aria-label="t('slug.changeParent')"
                    class="text-muted-foreground hover:text-foreground h-auto cursor-pointer p-0 font-normal hover:bg-transparent dark:hover:bg-transparent"
                  >
                    {{ prefix }}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ t("slug.changeParent") }}</p>
              </TooltipContent>
            </Tooltip>
            <template v-else>/</template>
          </InputGroupAddon>
          <InputGroupInput
            :id="id"
            v-model="model"
            v-bind="attrs"
            :pattern="SLUG_PATTERN"
            :aria-invalid="invalid"
            @input="edited = true"
            @paste="paste"
          />
        </InputGroup>
      </PopoverAnchor>
      <PopoverContent v-if="parent" align="start" class="w-(--reka-popper-anchor-width) p-0">
        <Command :model-value="parentId ?? ''" @update:model-value="pick">
          <CommandInput :placeholder="t('nav.search')" />
          <CommandList>
            <CommandEmpty>{{ t("common.noMatches") }}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="">
                /
                <span class="text-muted-foreground min-w-0 flex-1 truncate text-right">
                  {{ t("slug.topLevel") }}
                </span>
              </CommandItem>
              <CommandItem v-for="p in choices" :key="p.value" :value="p.value">
                {{ p.path || "/" }}
                <span class="text-muted-foreground min-w-0 flex-1 truncate text-right">{{
                  p.title
                }}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </FieldFrame>
</template>

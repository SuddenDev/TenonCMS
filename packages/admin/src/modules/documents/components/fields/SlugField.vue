<script setup lang="ts">
import { ref, watch } from "vue";
import { client, slugify, SLUG_PATTERN } from "@/shared/api";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/components/ui/input-group";

const props = defineProps<FieldProps<"slug">>();
const model = defineModel<any>();
// A new document's slug follows its `from` field until the editor edits the slug. Saved slugs never change, so URLs stay stable.
const edited = ref(false);
const prefix = ref("/");
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
// The prefix is the selected parent's path, e.g. `/about/`.
const relation = slug.parent ? props.siblings.fields[slug.parent] : undefined;
if (slug.parent && relation?.type === "relation") {
  const parent = slug.parent;
  watch(
    () => props.siblings.data[parent],
    async (id) => {
      const doc =
        typeof id === "string" && id
          ? await client.findById(relation.collection, id, { populate: false })
          : undefined;
      if (id !== props.siblings.data[parent]) return;
      const value = doc?.[slug.path ?? "path"];
      prefix.value = `${typeof value === "string" ? value.replace(/\/$/, "") : ""}/`;
    },
    { immediate: true },
  );
}
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
    <InputGroup class="h-9 rounded-md">
      <InputGroupAddon class="ml-px">{{ prefix }}</InputGroupAddon>
      <InputGroupInput
        :id="id"
        v-model="model"
        v-bind="attrs"
        :pattern="SLUG_PATTERN"
        :aria-invalid="invalid"
        @input="edited = true"
      />
    </InputGroup>
  </FieldFrame>
</template>

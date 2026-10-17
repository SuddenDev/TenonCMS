<script setup lang="ts">
import { inject } from "vue";
import { schema } from "@/shared/api";
import { ownerKey } from "@/modules/documents/fields";
import { useExtensionData } from "@/shared/composables/useExtensionData";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import Mount from "@/shared/components/Mount.vue";
import { Input } from "@/shared/components/ui/input";

const props = defineProps<FieldProps<`custom:${string}`>>();
const model = defineModel<any>();
const customType = props.field.type.slice(7);
const registered = schema.value.admin?.fields;
const custom =
  customType && registered && Object.hasOwn(registered, customType)
    ? registered[customType]
    : undefined;
// The server data of a custom field loads on mount and when the document gets its id. Value edits never reload it.
const owner = inject(ownerKey, undefined);
const loader =
  custom?.load && owner
    ? useExtensionData(() => ({
        kind: "field" as const,
        type: customType,
        path: props.path ?? props.name,
        owner: owner.value,
      }))
    : undefined;
</script>

<template>
  <FieldFrame v-bind="props" :unlabeled="!!custom" v-slot="{ id, attrs, invalid }">
    <Mount
      v-if="custom"
      :mount="custom.mount"
      :ctx="{ name, field, value: model, onChange: (v: any) => (model = v) }"
      :loader="loader"
    />
    <Input v-else :id="id" v-model="model" type="text" v-bind="attrs" :aria-invalid="invalid" />
  </FieldFrame>
</template>

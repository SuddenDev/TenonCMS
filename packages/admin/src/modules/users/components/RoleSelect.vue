<script setup lang="ts">
import { computed } from "vue";
import { schema } from "@/shared/api";
import { NativeSelect, NativeSelectOption } from "@/shared/components/ui/native-select";
import { FieldDescription } from "@/shared/components/ui/field";
import { text } from "@/shared/i18n";

defineOptions({ inheritAttrs: false });
const role = defineModel<string>({ required: true });
const roles = computed(() => schema.value.roles ?? []);
const description = computed(() => roles.value.find((r) => r.name === role.value)?.description);
</script>

<template>
  <NativeSelect v-model="role" v-bind="$attrs" class="w-full">
    <NativeSelectOption v-for="r in roles" :key="r.name" :value="r.name">
      {{ text(r.label) }}
    </NativeSelectOption>
  </NativeSelect>
  <FieldDescription v-if="description">{{ text(description) }}</FieldDescription>
</template>

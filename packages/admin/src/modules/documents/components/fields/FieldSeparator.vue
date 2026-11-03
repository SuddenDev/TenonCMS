<script setup lang="ts">
import type { Text } from "../../../../../../core/src/admin/index.d.ts";
import { text } from "@/shared/i18n";
import { Separator } from "@/shared/components/ui/separator";

// The `separator` option of a field: `true` draws the line, a text adds a heading below it.
defineProps<{ separator: true | Text }>();
</script>

<template>
  <div class="col-span-12 flex flex-col gap-2" :class="{ '-mb-4': separator !== true }">
    <h3 v-if="separator !== true" class="font-medium">{{ text(separator) }}</h3>
    <Separator />
  </div>
</template>

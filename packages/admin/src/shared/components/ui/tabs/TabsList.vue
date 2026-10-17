<script setup lang="ts">
import type { TabsListProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { TabsList } from "reka-ui";
import { cn } from "@/shared/utils";

const props = defineProps<TabsListProps & { class?: HTMLAttributes["class"] }>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    v-bind="delegatedProps"
    :class="
      cn(
        'border-border text-muted-foreground inline-flex w-fit items-center justify-center gap-1 rounded-xl border p-2',
        props.class,
      )
    "
  >
    <slot />
  </TabsList>
</template>

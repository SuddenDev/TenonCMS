<script setup lang="ts">
type BadgeColor = "note" | "tip" | "warning" | "caution" | "callout";

defineProps<{
  name?: string;
  type?: string;
  description?: string;
  required?: boolean;
  badges?: { label: string; color?: BadgeColor }[];
}>();

// Full class strings, so Tailwind can find them.
const badgeClasses: Record<BadgeColor, string> = {
  callout: "bg-stone-200 dark:bg-stone-800 text-toned",
  note: "bg-info/10 text-info",
  tip: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  caution: "bg-error/10 text-error",
};
</script>

<template>
  <div class="my-5">
    <div class="flex items-center gap-3 font-mono text-sm">
      <span v-if="name" class="text-primary font-semibold">{{ name }}</span>

      <div
        v-if="type || required || badges?.length"
        class="flex flex-1 items-center gap-1.5 text-xs"
      >
        <span v-if="type" class="bg-elevated text-toned rounded-sm px-1.5 py-0.5">{{ type }}</span>
        <span v-if="required" class="bg-error/10 text-error rounded-sm px-1.5 py-0.5">
          required
        </span>
        <div v-if="badges?.length" class="border-default ml-1 flex gap-1.5 border-l pl-2">
          <span
            v-for="badge in badges"
            :key="badge.label"
            :class="['rounded-sm px-1.5 py-0.5', badgeClasses[badge.color ?? 'note']]"
          >
            {{ badge.label }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="$slots.default || description" class="text-muted mt-3 text-sm [&_code]:text-xs/4">
      <slot mdc-unwrap="p">{{ description }}</slot>
    </div>
  </div>
</template>

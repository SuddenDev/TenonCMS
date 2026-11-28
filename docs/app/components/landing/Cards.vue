<script setup lang="ts">
import type { BadgeProps, ButtonProps } from "#ui/types";

interface Card {
  title: string;
  description: string;
  chips?: BadgeProps[];
  links?: ButtonProps[];
}

defineProps<{ cards: Card[] }>();

const columns: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
};
</script>

<template>
  <section
    :class="['divide-default grid divide-y lg:divide-x lg:divide-y-0', columns[cards.length]]"
  >
    <UPageCard
      v-for="card in cards"
      :key="card.title"
      variant="ghost"
      :title="card.title"
      :description="card.description"
      :ui="{ footer: 'flex flex-wrap gap-2 mt-0 pt-8' }"
    >
      <template #footer>
        <UBadge
          v-for="chip in card.chips"
          :key="chip.label"
          color="neutral"
          variant="outline"
          size="lg"
          class="font-mono"
          v-bind="chip"
        />
        <UButton
          v-for="link in card.links"
          :key="link.label"
          color="neutral"
          variant="outline"
          v-bind="link"
        />
      </template>
    </UPageCard>
  </section>
</template>

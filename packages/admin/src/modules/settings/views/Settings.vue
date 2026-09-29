<script setup lang="ts">
import { useHead } from "@unhead/vue";
import Icon from "@/shared/components/Icon.vue";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/shared/components/ui/item";
import { useSettings } from "@/shared/composables/useMenu";

useHead({ title: "Settings" });
const settings = useSettings();
</script>

<template>
  <div class="max-w-3xl">
    <h1 class="mb-6 text-2xl font-semibold">Settings</h1>
    <p v-if="!settings.length" class="text-muted-foreground">No settings yet.</p>
    <section v-for="group in settings" :key="group.label" class="mb-8">
      <h2 class="mb-3 text-lg font-semibold">{{ group.label }}</h2>
      <ItemGroup class="border-border bg-card gap-0 overflow-hidden rounded-lg border">
        <template v-for="(item, i) in group.items" :key="item.to">
          <ItemSeparator v-if="i" class="my-0" />
          <Item as-child class="hover:bg-muted/50 rounded-none">
            <RouterLink :to="item.to">
              <ItemMedia variant="icon"><Icon :name="item.icon" /></ItemMedia>
              <ItemContent>
                <ItemTitle>{{ item.label }}</ItemTitle>
                <ItemDescription v-if="item.description">{{ item.description }}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Icon name="chevron-right" class="text-muted-foreground" />
              </ItemActions>
            </RouterLink>
          </Item>
        </template>
      </ItemGroup>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import Icon from "@/shared/components/Icon.vue";
import { useTheme } from "@/shared/composables/useTheme";
import { sessionKey } from "@/shared/options";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

const { user, signOut } = inject(sessionKey)!;
const theme = useTheme();
const themes = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
] as const;

const initials = computed(() =>
  (user.value?.name || user.value?.email || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join(""),
);
</script>

<template>
  <DropdownMenu v-if="user">
    <DropdownMenuTrigger class="rounded-lg" :aria-label="user.name">
      <Avatar class="size-7 rounded-lg">
        <AvatarImage v-if="user.image" :src="user.image" :alt="user.name" />
        <AvatarFallback class="rounded-lg text-xs">{{ initials }}</AvatarFallback>
      </Avatar>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="min-w-56 rounded-lg" side="bottom" align="end" :side-offset="4">
      <DropdownMenuLabel class="p-0 font-normal">
        <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
          <Avatar class="h-8 w-8 rounded-lg">
            <AvatarImage v-if="user.image" :src="user.image" :alt="user.name" />
            <AvatarFallback class="rounded-lg">{{ initials }}</AvatarFallback>
          </Avatar>
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-semibold">{{ user.name }}</span>
            <span class="truncate text-xs">{{ user.email }}</span>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup v-model="theme">
        <DropdownMenuRadioItem v-for="t in themes" :key="t.value" :value="t.value">
          <Icon :name="t.icon" />
          {{ t.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="signOut">
        <Icon name="log-out" />
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

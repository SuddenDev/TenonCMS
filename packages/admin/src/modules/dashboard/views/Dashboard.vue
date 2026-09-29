<script setup lang="ts">
import { useSession } from "@/modules/auth/composables/useSession";

const { user } = useSession();
</script>
<template>
  <h1 class="text-2xl font-bold">Hi, {{ user?.name }}</h1>
  <div class="grid auto-rows-min gap-4 md:grid-cols-3">
    <div class="bg-muted/50 aspect-video rounded-xl" />
    <div class="bg-muted/50 aspect-video rounded-xl" />
    <div class="bg-muted/50 aspect-video rounded-xl" />
  </div>
</template>

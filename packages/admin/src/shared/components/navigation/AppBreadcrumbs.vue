<script setup lang="ts">
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/components/ui/breadcrumb";
import { useBreadcrumbs } from "@/shared/composables/useBreadcrumbs";

const crumbs = useBreadcrumbs();
</script>

<template>
  <Breadcrumb>
    <BreadcrumbList>
      <template v-for="(c, i) in crumbs" :key="c.to">
        <BreadcrumbSeparator v-if="i" class="hidden md:block" />
        <BreadcrumbItem :class="{ 'hidden md:block': i < crumbs.length - 1 }">
          <BreadcrumbPage v-if="i === crumbs.length - 1">{{ c.label }}</BreadcrumbPage>
          <BreadcrumbLink v-else as-child>
            <RouterLink :to="c.to">{{ c.label }}</RouterLink>
          </BreadcrumbLink>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>

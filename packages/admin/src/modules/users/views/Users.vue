<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, onMounted, provide, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import type { Invite, InviteResult } from "../../../../../core/src/client";
import { client } from "@/shared/api";
import {
  Icon,
  Pane,
  PaneMenu,
  PaneMenuItem,
  PaneMenuLabel,
  PaneMenuSkeleton,
  PaneSearch,
} from "@/shared";
import { Button } from "@/shared/components/ui/button";
import LinkDialog from "../components/LinkDialog.vue";
import UserStatus from "../components/UserStatus.vue";
import { rows, type AdminUser, type Row } from "../status";
import { listUsers, roleLabel, usersKey } from "../users";

const { t } = useI18n();
const route = useRoute();
useHead({ title: () => t("nav.users") });

const users = shallowRef<AdminUser[]>([]);
const invites = shallowRef<Invite[]>([]);
const loading = ref(true);
const search = ref("");

async function load() {
  [users.value, invites.value] = await Promise.all([listUsers(), client.invites.list()]);
}
onMounted(() =>
  load()
    .catch((e: Error) => toast.error(e.message))
    .finally(() => (loading.value = false)),
);

const link = ref<{ email: string; link: string; failed: boolean }>();
const linkOpen = ref(false);
function showLink(result: InviteResult, failed: boolean) {
  link.value = { email: result.invite.email, link: result.link, failed };
  linkOpen.value = true;
}
provide(usersKey, { users, invites, loading, load, showLink });

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return rows(users.value, invites.value).filter(
    (r) => !q || `${r.name} ${r.email}`.toLowerCase().includes(q),
  );
});
const people = computed(() => filtered.value.filter((r) => r.kind === "user"));
const pending = computed(() => filtered.value.filter((r) => r.kind === "invite"));
const to = (row: Row) => (row.kind === "user" ? `/users/${row.id}` : `/users/invites/${row.id}`);
</script>

<template>
  <Pane :title="t('nav.users')">
    <template #actions>
      <Button as-child variant="ghost" size="icon-sm" :aria-label="t('users.new')">
        <RouterLink to="/users/new"><Icon name="plus" /></RouterLink>
      </Button>
    </template>
    <PaneSearch v-model="search" />
    <PaneMenu layout="detailed">
      <PaneMenuSkeleton v-if="loading" />
      <template v-else>
        <PaneMenuItem
          v-for="row in people"
          :key="row.id"
          :to="to(row)"
          icon="user"
          :label="row.name || row.email"
          :subtitle="`${roleLabel(row.role)} · ${row.email}`"
          :active="route.path === to(row)"
        >
          <template #end><UserStatus :status="row.status" compact /></template>
        </PaneMenuItem>
        <template v-if="pending.length">
          <PaneMenuLabel>{{ t("users.invites") }}</PaneMenuLabel>
          <PaneMenuItem
            v-for="row in pending"
            :key="row.id"
            :to="to(row)"
            icon="mail"
            :label="row.email"
            :subtitle="roleLabel(row.role)"
            :active="route.path === to(row)"
          >
            <template #end><UserStatus :status="row.status" compact /></template>
          </PaneMenuItem>
        </template>
        <p v-if="!filtered.length" class="text-muted-foreground px-2 py-2 text-sm">
          {{ t("common.noMatches") }}
        </p>
      </template>
    </PaneMenu>
  </Pane>
  <RouterView v-slot="{ Component }">
    <component :is="Component" v-if="Component" :key="route.path" />
    <div
      v-else
      class="text-muted-foreground hidden flex-1 items-center justify-center text-sm sm:flex"
    >
      {{ t("users.select") }}
    </div>
  </RouterView>
  <LinkDialog v-if="link" v-model:open="linkOpen" v-bind="link" />
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { client, schema } from "@/shared/api";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import UserPane from "../components/UserPane.vue";
import UserStatus from "../components/UserStatus.vue";
import { rows } from "../status";
import { adminUrl, roleLabel, sendingInvite, usersKey } from "../users";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const ctx = inject(usersKey)!;

const invite = computed(() => ctx.invites.value.find((i) => i.id === String(route.params.id)));
const row = computed(() => invite.value && rows([], [invite.value])[0]);
const role = computed(() => (invite.value ? roleLabel(invite.value.role) : ""));
const date = (iso: string) => new Date(iso).toLocaleDateString(locale.value);

/** With email, the invite is sent. Without, or when sending failed, the admin copies the link. */
async function resend() {
  let sent;
  try {
    sent = await sendingInvite(() =>
      client.invites.resend(invite.value!.id, { url: adminUrl(router, "/invite") }),
    );
  } catch (e) {
    return toast.error((e as Error).message);
  }
  const { result, failed } = sent;
  if (result.sent) toast.success(t("users.inviteSent", { email: result.invite.email }));
  else ctx.showLink(result, failed);
  await ctx.load().catch(() => {});
}

const confirmOpen = ref(false);
async function revoke() {
  try {
    await client.invites.revoke(invite.value!.id);
  } catch (e) {
    return toast.error((e as Error).message);
  }
  await ctx.load().catch(() => {});
  await router.push("/users");
}
</script>

<template>
  <UserPane v-if="invite && row" :title="invite.email" :kind="t('users.inviteKind')">
    <Card>
      <CardContent>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted-foreground">{{ t("users.role") }}</dt>
          <dd>{{ role || invite.role }}</dd>
          <dt class="text-muted-foreground">{{ t("users.status") }}</dt>
          <dd><UserStatus :status="row.status" /></dd>
          <dt class="text-muted-foreground">{{ t("users.invited") }}</dt>
          <dd>{{ date(invite.createdAt) }}</dd>
          <dt class="text-muted-foreground">{{ t("users.expires") }}</dt>
          <dd>{{ date(invite.expiresAt) }}</dd>
        </dl>
      </CardContent>
    </Card>
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" @click="resend">
        {{ t(schema.email ? "users.resend" : "users.newLink") }}
      </Button>
      <Button variant="destructive" @click="confirmOpen = true">{{ t("users.revoke") }}</Button>
    </div>
    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('users.confirm.revoke.title', { email: invite.email })"
      :text="t('users.confirm.revoke.text')"
      :action="t('users.revoke')"
      destructive
      @confirm="revoke"
    />
  </UserPane>
  <p v-else-if="!ctx.loading.value" class="text-muted-foreground flex-1 p-6 text-sm">
    {{ t("users.notFound") }}
  </p>
</template>

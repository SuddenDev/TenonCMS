<script setup lang="ts">
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { client, schema } from "@/shared/api";
import PasswordInput from "@/modules/auth/components/PasswordInput.vue";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import RoleSelect from "../components/RoleSelect.vue";
import UserPane from "../components/UserPane.vue";
import { adminUrl, createUser, sendingInvite, usersKey } from "../users";

const { t } = useI18n();
const router = useRouter();
const ctx = inject(usersKey)!;

// `invite`: the user chooses a name and password from a link. `create`: the admin sets both.
const mode = ref<"invite" | "create">("invite");
const email = ref("");
const name = ref("");
const password = ref("");
const role = ref("editor");
const error = ref("");
const busy = ref(false);

async function invite() {
  const body = { email: email.value, role: role.value, url: adminUrl(router, "/invite") };
  const { result, failed } = await sendingInvite(() => client.invites.create(body));
  await ctx.load();
  await router.push(`/users/invites/${result.invite.id}`);
  if (result.sent) toast.success(t("users.inviteSent", { email: result.invite.email }));
  else ctx.showLink(result, failed);
}

async function create() {
  const user = await createUser({
    email: email.value,
    name: name.value,
    password: password.value,
    role: role.value,
  });
  await ctx.load();
  await router.push(`/users/${user.id}`);
  toast.success(t("users.created", { name: user.name }));
}

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await (mode.value === "invite" ? invite() : create());
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UserPane :title="t('users.new')" :kind="t('users.user')">
    <Card>
      <CardContent>
        <form :aria-busy="busy" @submit.prevent="submit">
          <FieldGroup class="gap-6">
            <Tabs v-model="mode">
              <TabsList class="w-full">
                <TabsTrigger value="invite" class="flex-1">{{ t("users.modeInvite") }}</TabsTrigger>
                <TabsTrigger value="create" class="flex-1">{{ t("users.modeCreate") }}</TabsTrigger>
              </TabsList>
            </Tabs>
            <FieldDescription>
              {{
                mode === "create"
                  ? t("users.createDescription")
                  : t(schema.email ? "users.inviteByEmail" : "users.inviteByLink")
              }}
            </FieldDescription>
            <fieldset :disabled="busy" class="contents">
              <Field>
                <FieldLabel for="new-user-email">{{ t("auth.email") }}</FieldLabel>
                <Input
                  id="new-user-email"
                  v-model="email"
                  type="email"
                  autocomplete="off"
                  required
                />
              </Field>
              <template v-if="mode === 'create'">
                <Field>
                  <FieldLabel for="new-user-name">{{ t("auth.name") }}</FieldLabel>
                  <Input id="new-user-name" v-model="name" autocomplete="off" required />
                </Field>
                <Field>
                  <FieldLabel for="new-user-password">{{ t("auth.password") }}</FieldLabel>
                  <PasswordInput
                    id="new-user-password"
                    v-model="password"
                    variant="register"
                    generate
                    autocomplete="new-password"
                    minlength="8"
                    required
                  />
                </Field>
              </template>
              <Field>
                <FieldLabel for="new-user-role">{{ t("users.role") }}</FieldLabel>
                <RoleSelect id="new-user-role" v-model="role" />
              </Field>
            </fieldset>
            <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
            <Button type="submit" class="justify-self-start" :disabled="busy">
              {{
                mode === "create"
                  ? t("users.createUser")
                  : t(schema.email ? "users.sendInvite" : "users.createInvite")
              }}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  </UserPane>
</template>

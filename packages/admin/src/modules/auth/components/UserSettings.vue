<script setup lang="ts">
import { inject, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { sessionKey } from "@/shared/options";
import { localeLabel } from "@/shared/locale";
import { useAdminLocale } from "@/shared/i18n";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import TimezoneSelect from "@/shared/components/TimezoneSelect.vue";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/shared/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/shared/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { updateUser } from "../account";
import { passkeysSupported } from "../passkey";
import PasskeyList from "./PasskeyList.vue";
import PasswordForm from "./PasswordForm.vue";

const open = defineModel<boolean>("open", { default: false });
const { user } = inject(sessionKey)!;
const { t } = useI18n();
const { locale, locales } = useAdminLocale();
const { preferred } = useTimeZone();
const passkeys = passkeysSupported();
const form = ref({ name: "", language: locale.value, timezone: null as string | null });
const error = ref("");
const busy = ref(false);

watch(open, (o) => {
  if (!o || !user.value) return;
  form.value = { name: user.value.name, language: locale.value, timezone: preferred.value };
  error.value = "";
});

async function save() {
  if (busy.value || !user.value) return;
  busy.value = true;
  error.value = "";
  try {
    await updateUser(form.value);
    // The user first, so the language watcher of `useSession()` finds nothing left to save.
    Object.assign(user.value, form.value);
    locale.value = form.value.language;
    preferred.value = form.value.timezone;
    toast.success(t("account.saved"));
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t("account.settings") }}</DialogTitle>
        <DialogDescription>{{ user?.email }}</DialogDescription>
      </DialogHeader>
      <Tabs default-value="profile" class="gap-4">
        <TabsList class="w-full">
          <TabsTrigger value="profile" class="flex-1">{{ t("account.profile") }}</TabsTrigger>
          <TabsTrigger value="security" class="flex-1">{{ t("account.security") }}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <form :aria-busy="busy" @submit.prevent="save">
            <FieldGroup class="gap-6">
              <Field>
                <FieldLabel for="account-name">{{ t("auth.name") }}</FieldLabel>
                <Input id="account-name" v-model="form.name" autocomplete="name" required />
              </Field>
              <Field>
                <FieldLabel for="account-language">{{ t("account.language") }}</FieldLabel>
                <NativeSelect id="account-language" v-model="form.language" class="w-full">
                  <NativeSelectOption v-for="code in locales" :key="code" :value="code">
                    {{ localeLabel(code) }}
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel for="account-timezone">{{ t("account.timezone") }}</FieldLabel>
                <TimezoneSelect id="account-timezone" v-model="form.timezone" />
                <FieldDescription>{{ t("account.timezoneHint") }}</FieldDescription>
              </Field>
              <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
              <Button type="submit" class="justify-self-start" size="lg" :disabled="busy">
                {{ t("account.save") }}
              </Button>
            </FieldGroup>
          </form>
        </TabsContent>
        <TabsContent value="security">
          <FieldGroup class="gap-6">
            <FieldSet>
              <FieldLegend>{{ t("auth.password") }}</FieldLegend>
              <PasswordForm />
            </FieldSet>
            <template v-if="passkeys">
              <FieldSeparator />
              <FieldSet>
                <FieldLegend>{{ t("auth.passkeys") }}</FieldLegend>
                <FieldDescription>{{ t("auth.passkeysDescription") }}</FieldDescription>
                <PasskeyList />
              </FieldSet>
            </template>
          </FieldGroup>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
